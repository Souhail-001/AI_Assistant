#!/usr/bin/env python3
"""Plot RAG evaluation metrics from CSV."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
import matplotlib.pyplot as plt


def main() -> int:
    parser = argparse.ArgumentParser(description="Plot RAG evaluation metrics.")
    parser.add_argument("--csv", default="rag_eval_metrics.csv")
    parser.add_argument("--out", default="rag_eval_metrics.png")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    df = pd.read_csv(csv_path)
    if df.empty:
        raise ValueError("CSV has no rows to plot.")

    fig, axes = plt.subplots(1, 3, figsize=(14, 4))
    fig.suptitle("RAG Evaluation Metrics")

    axes[0].bar(df["query_id"], df["retrieval_ms"].astype(float), color="#2e86ab")
    axes[0].set_title("Retrieval Latency (ms)")
    axes[0].set_xlabel("Query ID")
    axes[0].set_ylabel("ms")

    axes[1].bar(df["query_id"], df["overlap"].astype(float), color="#f6ae2d")
    axes[1].set_title("Source Overlap")
    axes[1].set_xlabel("Query ID")
    axes[1].set_ylabel("ratio")

    axes[2].bar(df["query_id"], df["rank"].astype(int), color="#33658a")
    axes[2].set_title("Hit Rank")
    axes[2].set_xlabel("Query ID")
    axes[2].set_ylabel("rank")

    fig.tight_layout()
    fig.savefig(args.out, dpi=200)
    print(f"Saved chart to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
