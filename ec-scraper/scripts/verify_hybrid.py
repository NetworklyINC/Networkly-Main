"""Verify Hybrid Architecture (Groq + Gemini)."""
import asyncio
import os
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from rich import print as rprint

# Load main .env first (for Google Key)
load_dotenv(Path(__file__).parent.parent / ".env")
# Load hybrid config OVER top (for Groq mode)
load_dotenv(Path(__file__).parent.parent / "config_hybrid.env", override=True)

from src.config.settings import get_settings
from src.llm import get_llm_provider
from src.embeddings import get_embeddings

async def main():
    settings = get_settings()
    
    rprint(f"\n[bold blue]Hybrid Architecture Verification[/bold blue]")
    rprint("====================================")
    rprint(f"API Mode:         [green]{settings.api_mode.upper()}[/green]")
    rprint(f"LLM Provider:     [green]{get_llm_provider().name.upper()}[/green] (Logic)")
    rprint(f"Embeddings:       [green]{get_embeddings().model_name}[/green] (Gemini)")
    rprint("====================================\n")

    if settings.api_mode != "groq":
        rprint("[red]❌ Error: API_MODE is not 'groq'. Check config_hybrid.env[/red]")
        sys.exit(1)

    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY.startswith("gsk_Example"):
        rprint("[red]❌ Error: GROQ_API_KEY is missing/default. Please edit config_hybrid.env[/red]")
        sys.exit(1)

    # 1. Test LLM (Groq)
    rprint("[yellow]Testing Logic (Groq)...[/yellow]")
    try:
        provider = get_llm_provider()
        response = await provider.generate("Say 'Hybrid Mode Active' in exactly 3 words.")
        rprint(f"[green]✓ Groq Response:[/green] {response}")
    except Exception as e:
        rprint(f"[red]✗ Groq Failed:[/red] {e}")

    # 2. Test Embeddings (Gemini)
    rprint("\n[yellow]Testing Embeddings (Gemini)...[/yellow]")
    try:
        embeddings = get_embeddings()
        vector = embeddings.generate_for_indexing("Test embedding text")
        rprint(f"[green]✓ Gemini Embedding Generated:[/green] {len(vector)} dims")
    except Exception as e:
        rprint(f"[red]✗ Gemini Failed:[/red] {e}")

if __name__ == "__main__":
    asyncio.run(main())
