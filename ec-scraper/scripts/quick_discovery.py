"""Quick discovery script for on-demand user searches with JSON event streaming.
 
Optimized for performance with parallel crawling and extraction.
"""
import asyncio
import os
import sys
import json
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load env first
load_dotenv()

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.search.searxng_client import get_searxng_client
from src.agents.extractor import get_extractor
from src.crawlers.crawl4ai_client import get_crawler
from src.api.postgres_sync import PostgresSync
from src.config import get_settings
from src.embeddings import get_embeddings
from src.db.vector_db import get_vector_db
from src.db.models import OpportunityTiming


def emit_event(type: str, data: dict):
    """Emit a JSON event to stdout."""
    event = {"type": type, **data}
    print(json.dumps(event), flush=True)
    sys.stdout.flush()


async def process_url(url: str, crawler, extractor, sync) -> dict | None:
    """
    Process a single URL: crawl, extract, and save.
    Returns card data if successful, None otherwise.
    """
    try:
        # Crawl
        crawl_result = await crawler.crawl(url)
        if not crawl_result.success:
            return {"error": f"Crawl failed: {crawl_result.error}", "url": url}
        
        content_len = len(crawl_result.markdown or '')
        if content_len < 100:
            return {"error": f"Content too short: {content_len} chars", "url": url}
        
        # Extract
        extraction = await extractor.extract(crawl_result.markdown, url)
        if not extraction.success:
            return {"error": f"Extraction failed: {extraction.error}", "url": url}
        
        ec = extraction.ec_card
        if not ec:
            return {"error": "No card extracted", "url": url}
        
        # Skip low-confidence extractions
        confidence = extraction.confidence or 0.0
        if confidence < 0.4:
            return {"error": f"Low confidence: {confidence:.2f}", "url": url}
        
        # Skip generic/invalid extractions
        if ec.title == "Unknown Opportunity" or ec.organization in ["Unknown", None, ""]:
            return {"error": "Generic extraction", "url": url}
        
        # Skip ranking/list articles
        title_lower = ec.title.lower()
        if any(skip in title_lower for skip in ['best ', 'top ', 'ranking', 'list of', '94 ', '100 ']):
            return {"error": f"Ranking article: {ec.title}", "url": url}
        
        # Time-based filtering
        # Reject expired one-time opportunities (past 30 days grace period)
        if ec.is_expired and ec.timing_type == OpportunityTiming.ONE_TIME:
            return {"error": f"Expired one-time opportunity (deadline/end date in the past)", "url": url}
        
        # For expired recurring/annual opportunities, set priority recheck
        if ec.is_expired and ec.timing_type in [OpportunityTiming.ANNUAL, OpportunityTiming.RECURRING, OpportunityTiming.SEASONAL]:
            ec.recheck_days = 3  # Priority recheck for next cycle
        
        # Sync to database
        await sync.upsert_opportunity(ec)
        
        # Return success with card data
        return {
            "success": True,
            "url": url,
            "card": {
                "title": ec.title,
                "organization": ec.organization,
                "type": ec.ec_type.value,
                "location": ec.location
            }
        }
        
    except Exception as e:
        return {"error": str(e)[:100], "url": url}


async def main(query: str):
    emit_event("plan", {"message": f"Analyzing request: '{query}'"})
    
    # Get database URL
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        db_url = db_url.strip().strip('"').strip("'")
    
    if not db_url:
        emit_event("error", {"message": "DATABASE_URL not found"})
        return
    
    # Get settings for Groq mode
    settings = get_settings()

    # Initialize components
    search_client = get_searxng_client()
    crawler = get_crawler()
    extractor = get_extractor()
    sync = PostgresSync(db_url)
    await sync.connect()

    # Initialize embeddings and vector DB (only if enabled - Groq doesn't support embeddings)
    embeddings = None
    vector_db = None
    if settings.use_embeddings:
        try:
            embeddings = get_embeddings()
            vector_db = get_vector_db()
        except Exception as e:
            sys.stderr.write(f"⚠ Failed to initialize embeddings: {e}\n")
    
    all_urls = set()
    
    # Generate targeted high-school specific queries with dynamic years
    emit_event("plan", {"message": "Generating targeted high school search strategies..."})

    current_year = datetime.now().year
    next_year = current_year + 1
    base_query = query.strip()
    search_queries = [
        f"high school {base_query} summer program {current_year}",
        f"{base_query} internship for high school students",
        f"{base_query} research opportunities for high schoolers",
        f"{base_query} competitions high school {current_year}",
        f"{base_query} volunteer work for teens",
    ]
    
    # Search phase - run searches in parallel
    async def do_search(search_query: str):
        emit_event("search", {"query": search_query})
        try:
            # Uses client's default engines (wikipedia, ask, mojeek, yahoo)
            return await search_client.search(search_query, max_results=10)
        except Exception as e:
            sys.stderr.write(f"Search error: {e}\n")
            return []
    
    search_tasks = [do_search(q) for q in search_queries]
    search_results = await asyncio.gather(*search_tasks)
    
    # Collect and filter URLs
    skip_patterns = [
        'reddit.com', 'quora.com', 'forum', 'discussion', 'blog',
        'linkedin.com', 'facebook.com', 'twitter.com', 'x.com',
        'instagram.com', 'tiktok.com', 'indeed.com', 'glassdoor.com',
        'ziprecruiter.com', 'youtube.com', 'pinterest.com'
    ]
    
    for results in search_results:
        for result in results:
            url_lower = result.url.lower()
            if any(skip in url_lower for skip in skip_patterns):
                continue
            if result.url not in all_urls:
                all_urls.add(result.url)
                emit_event("found", {"url": result.url, "source": result.title or "Web Result"})
    
    urls_to_process = list(all_urls)[:10]  # Process up to 10 URLs for faster results
    emit_event("plan", {"message": f"Found {len(all_urls)} sources. Analyzing {len(urls_to_process)} in parallel..."})
    
    # Emit analyzing events for all URLs
    for url in urls_to_process:
        emit_event("analyzing", {"url": url})
    
    # Process URLs in PARALLEL using crawl_batch for crawling
    # Then extract in parallel with semaphore to limit AI API calls
    crawl_results = await crawler.crawl_batch(urls_to_process, max_concurrent=6)
    
    # Filter successful crawls and extract in parallel
    # Groq can handle 5+ concurrent requests on paid tier
    extraction_semaphore = asyncio.Semaphore(5)
    
    async def extract_and_save(crawl_result) -> dict | None:
        if not crawl_result.success:
            return {"error": f"Crawl failed: {crawl_result.error}", "url": crawl_result.url}
        
        content_len = len(crawl_result.markdown or '')
        if content_len < 100:
            return {"error": f"Content too short: {content_len} chars", "url": crawl_result.url}
        
        async with extraction_semaphore:
            try:
                extraction = await extractor.extract(crawl_result.markdown, crawl_result.url)
                if not extraction.success:
                    return {"error": f"Extraction failed: {extraction.error}", "url": crawl_result.url}
                
                ec = extraction.ec_card
                if not ec:
                    return {"error": "No card extracted", "url": crawl_result.url}
                
                # Skip low-confidence extractions
                confidence = extraction.confidence or 0.0
                if confidence < 0.4:
                    return {"error": f"Low confidence: {confidence:.2f}", "url": crawl_result.url}
                
                # Skip generic/invalid extractions
                if ec.title == "Unknown Opportunity" or ec.organization in ["Unknown", None, ""]:
                    return {"error": "Generic extraction", "url": crawl_result.url}
                
                # Skip ranking/list articles (common noise)
                title_lower = ec.title.lower()
                if any(skip in title_lower for skip in ['best ', 'top ', 'ranking', 'list of']):
                    return {"error": f"Ranking article: {ec.title}", "url": crawl_result.url}
                
                # Time-based filtering
                # Reject expired one-time opportunities (past 30 days grace period)
                if ec.is_expired and ec.timing_type == OpportunityTiming.ONE_TIME:
                    return {"error": f"Expired one-time opportunity (deadline/end date in the past)", "url": crawl_result.url}
                
                # For expired recurring/annual opportunities, set priority recheck
                if ec.is_expired and ec.timing_type in [OpportunityTiming.ANNUAL, OpportunityTiming.RECURRING, OpportunityTiming.SEASONAL]:
                    ec.recheck_days = 3  # Priority recheck for next cycle
                
                # Sync to database
                await sync.upsert_opportunity(ec)

                # Add to vector DB with embeddings (only if enabled)
                if embeddings and vector_db and settings.use_embeddings:
                    try:
                        emb_vector = embeddings.generate_for_indexing(ec.to_embedding_text())
                        vector_db.add_ec_with_embedding(ec, emb_vector)
                    except Exception as emb_err:
                        pass  # Silent fail for embeddings

                return {
                    "success": True,
                    "url": crawl_result.url,
                    "card": {
                        "title": ec.title,
                        "organization": ec.organization,
                        "type": ec.ec_type.value,
                        "location": ec.location
                    }
                }
            except Exception as e:
                return {"error": str(e)[:100], "url": crawl_result.url}
    
    # Run extractions in parallel
    extraction_tasks = [extract_and_save(cr) for cr in crawl_results]
    results = await asyncio.gather(*extraction_tasks)
    
    # Emit results as they complete
    success_count = 0
    for result in results:
        if result:
            if result.get("success"):
                success_count += 1
                emit_event("extracted", {"card": result["card"]})
            elif result.get("error"):
                emit_event("error", {"message": f"{result['url']}: {result['error']}"})
    
    emit_event("complete", {"count": success_count})
    await sync.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"type": "error", "message": "Usage: python quick_discovery.py \"search query\""}))
        sys.exit(1)
    
    query = " ".join(sys.argv[1:])
    try:
        asyncio.run(main(query))
    except Exception as e:
        print(json.dumps({"type": "error", "message": str(e)}))
        sys.exit(1)
