"""Render the saved S-6 numerical report with Matplotlib 3.10.8."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import ScalarFormatter

root = Path(__file__).resolve().parent.parent
report = json.loads((root / "docs/spikes/S-6-swarm-load.json").read_text())
scenarios = [
    ("web-seed-only", "Web seed only", "#283747", "s"),
    ("swarm-foreground", "Sharing, foreground", "#1565b0", "o"),
    ("web-seed-churn", "Web seed, churn", "#6c7580", "^"),
    ("swarm-churn", "Sharing, churn", "#13804b", "D"),
    ("swarm-churn-leave", "Sharing, churn, leave on completion", "#b04a08", "X"),
]
fig, axes = plt.subplots(1, 3, figsize=(15, 6.1))
fig.subplots_adjust(left=0.065, right=0.985, top=0.68, bottom=0.23, wspace=0.33)
metrics = [
    ("median_ms", 1000, "Median download time", "Seconds"),
    ("p95_ms", 1000, "p95 download time", "Seconds"),
    ("mean_seed_bytes", 1024 ** 2, "Mean total web-seed egress", "MiB"),
]
for axis, (metric, divisor, title, unit) in zip(axes, metrics):
    for name, label, color, marker in scenarios:
        rows = [row for row in report["summaries"] if row["scenario"] == name]
        axis.plot([row["clients"] for row in rows],
                  [row[metric] / divisor if row[metric] is not None else float("nan") for row in rows],
                  color=color, marker=marker, label=label, linewidth=1.7, markersize=6)
    axis.set_xscale("log")
    axis.set_yscale("log")
    axis.set_xticks([50, 500, 1000], ["50", "500", "1,000"])
    axis.xaxis.set_minor_locator(plt.NullLocator())
    axis.yaxis.set_major_formatter(ScalarFormatter())
    axis.set_xlabel("Clients", labelpad=9)
    axis.set_ylabel(unit)
    axis.set_title(title, fontsize=11, pad=12)
    axis.grid(True, which="major", color="#dfe3e8", linewidth=0.7)
    axis.spines[["top", "right"]].set_visible(False)

completed = sum(row["completed"] for row in report["summaries"])
expected = sum(row["expected"] for row in report["summaries"])
fig.text(0.5, 0.96, "S-6 modeled load · 16 MiB file · five fixed seeds", ha="center", fontsize=17, weight="bold")
fig.text(0.5, 0.905, f"{completed:,} of {expected:,} client completions · logarithmic axes · real-code Gate C pending",
         ha="center", fontsize=10, color="#45515e")
handles, labels = axes[0].get_legend_handles_labels()
fig.legend(handles, labels, loc="upper center", bbox_to_anchor=(0.5, 0.86), ncols=3, frameon=False, fontsize=9)
fig.text(0.065, 0.115, "250 ms ticks · 100 ms configured latency · 8 MiB/s seed · 1 MiB/s peer upload · 4 MiB/s download",
         fontsize=9, color="#45515e")
fig.text(0.065, 0.073, "Churn uses 2 s downtime per 10 s, 1% transfer-loss probability and 20% peer-edge block probability. Clients start together.",
         fontsize=9, color="#45515e")
fig.text(0.065, 0.031, "Times pool all clients across five seeds. Seed egress averages five runs. Synthetic inputs and scope are recorded in ADR 009.",
         fontsize=9, color="#45515e")
fig.savefig(root / "docs/spikes/S-6-swarm-load.png", dpi=160, metadata={"Software": f"Matplotlib {matplotlib.__version__}"})
