---
date: 2026-01-09T14:00:00-08:00
researcher: Taras
git_commit: e616532d713c40f206a01f26e6ae3f25c1edff27
branch: main
repository: ai-toolbox
topic: "Stats Visualization Options for CLI Tool"
tags: [research, visualization, cli, tui, dashboard, rich, textual, plotext]
status: complete
last_updated: 2026-01-09
last_updated_by: Taras
---

# Research: Stats Visualization Options for CLI Tool

**Date**: 2026-01-09
**Git Commit**: e616532
**Branch**: main
**Repository**: ai-toolbox

## Research Question

What are the options for displaying AI vs human code statistics in a CLI tool? Specifically:
1. CLI-only options (simple text, tables, colored output)
2. TUI libraries (rich, textual, blessed for Python)
3. Web dashboard options (local server, static HTML generation)
4. What metrics/visualizations would be most useful

## Summary

For the AI code tracking tool, there are three tiers of visualization complexity:

1. **CLI-only (Simplest)**: Use Rich for colored tables and progress bars - sufficient for basic stats
2. **TUI (Intermediate)**: Use Rich + Plotext for in-terminal charts, or Textual for interactive dashboards
3. **Web Dashboard (Most Visual)**: Use Dash/Streamlit for browser-based charts, or generate static HTML

**Recommendation**: Start with **Rich + Plotext** for terminal-based visualization. This provides tables, colored output, and ASCII charts without leaving the terminal. Add a `--web` flag later for HTML export if needed.

---

## Detailed Findings

### 1. CLI-Only Options

#### Simple Text Output
The most basic approach - just print formatted strings:
```python
print(f"AI Lines: {ai_lines} ({ai_pct:.1f}%)")
print(f"Human Lines: {human_lines} ({human_pct:.1f}%)")
```
**Pros**: Zero dependencies, works everywhere
**Cons**: Hard to read, no visual hierarchy

#### Colored ANSI Output
Use ANSI escape codes or colorama for colored text:
```python
from colorama import Fore, Style
print(f"{Fore.CYAN}AI: {ai_lines}{Style.RESET_ALL}")
```
**Pros**: Low dependency, adds visual distinction
**Cons**: Limited formatting options

#### Rich Tables (Recommended for CLI)
Rich provides beautiful terminal tables with minimal code:
```python
from rich.console import Console
from rich.table import Table

table = Table(title="Code Authorship Stats")
table.add_column("Source", style="cyan")
table.add_column("Lines Added", justify="right")
table.add_column("Percentage", justify="right")
table.add_row("AI (Claude)", "1,245", "68%")
table.add_row("Human", "582", "32%")

Console().print(table)
```

Rich capabilities:
- Colored and styled text
- Tables with borders, alignment, column styles
- Progress bars for long operations
- Panels and boxes for grouping
- Markdown rendering
- Works on Linux, macOS, Windows (new Windows Terminal)

**Sources**:
- [Rich GitHub Repository](https://github.com/Textualize/rich)
- [Rich Documentation](https://rich.readthedocs.io/en/latest/introduction.html)
- [Real Python - Rich Package Tutorial](https://realpython.com/python-rich-package/)

---

### 2. TUI Libraries for Python

#### Rich (Textualize)
**Best for**: Formatted output, tables, progress bars
**Stars**: 50k+ on GitHub
**Install**: `pip install rich`

Features:
- Tables with customizable styles
- Progress bars with ETA
- Syntax highlighting
- Markdown/code rendering
- Live displays (auto-updating content)
- Jupyter notebook support

**Limitations**: No built-in charts/graphs - need external library like Plotext

#### Textual (Textualize)
**Best for**: Full interactive terminal applications
**Stars**: 25k+ on GitHub
**Install**: `pip install textual`

Features:
- Async-powered TUI framework built on Rich
- CSS-like stylesheets for appearance
- Responsive layouts that adapt to terminal size
- Widgets: buttons, text areas, panels, dialogs
- Mouse support, smooth animation
- 16.7 million colors on modern terminals
- Can also run as web app

Example use case: Interactive stats dashboard where you can navigate between repos, time periods, drill down into files.

**When to use**: If you need interactivity (keyboard navigation, drill-down views, live updates)

#### Plotext (Terminal Charts)
**Best for**: ASCII/Unicode charts in terminal
**Stars**: 3k+ on GitHub
**Install**: `pip install plotext`

Features:
- Bar charts, line plots, scatter plots
- Histograms
- Date-time plots
- Stacked and grouped bars
- Has official Rich integration
- Similar API to matplotlib

```python
import plotext as plt

plt.bar(["AI", "Human"], [1245, 582])
plt.title("Lines Added by Source")
plt.show()
```

Output:
```
    Lines Added by Source
    ┌──────────────────────────────────┐
1245│████████████████████              │
    │████████████████████              │
 582│████████████████████ ████████████ │
    │████████████████████ ████████████ │
    └──────────────────────────────────┘
           AI          Human
```

**Integration with Rich**:
```python
from rich.console import Console
import plotext as plt

plt.bar(["AI", "Human"], [1245, 582])
plt.plotsize(60, 15)
console = Console()
console.print(plt.build())  # Get string output
```

#### Textual-Plotext
**Best for**: Charts inside Textual apps
**Install**: `pip install textual-plotext`

Wraps Plotext for use as a Textual widget - great for interactive dashboards with charts.

#### Other Terminal Chart Libraries

| Library | Stars | Best For |
|---------|-------|----------|
| **termgraph** | 3k+ | Simple bar/histogram charts |
| **asciichartpy** | 400+ | Line charts, streaming data |
| **termplotlib** | 700+ | Various plots |
| **py-ascii-graph** | 200+ | Simple ASCII histograms |

**Sources**:
- [Plotext GitHub](https://github.com/piccolomo/plotext)
- [Termgraph GitHub](https://github.com/mkaz/termgraph)
- [Python Terminal Plotting Overview](https://www.pythonkitchen.com/an-overview-of-python-terminal-plotting-libraries/)
- [Textual Documentation](https://realpython.com/python-textual/)
- [Plotting in Terminal with Textualize](https://www.blog.pythonlibrary.org/2024/08/19/how-to-plot-in-the-terminal-with-python-and-textualize/)

#### Blessed (Note: Node.js, not Python)
Blessed is for Node.js, not Python. For Python, use Textual or urwid instead.

#### Urwid
**Best for**: Low-level terminal UI control
**Mature library** but more complex than Textual. Use if you need maximum control.

---

### 3. Web Dashboard Options

#### Static HTML Generation (Simplest Web Option)
Generate a self-contained HTML file with embedded charts:

```python
import plotly.graph_objects as go

fig = go.Figure(data=[go.Pie(labels=['AI', 'Human'], values=[1245, 582])])
fig.write_html("stats_report.html")  # Self-contained, no server needed
```

**Pros**:
- No server required
- Can email/share the file
- Works offline
- Can include interactive Plotly charts

**Libraries for static HTML**:
- **Plotly** - Interactive charts, exports to HTML
- **Matplotlib** - Static charts, export to PNG/SVG/HTML
- **Altair** - Declarative charts, exports to HTML

#### Dash (by Plotly)
**Best for**: Interactive web dashboards
**Install**: `pip install dash`

Features:
- Build web apps with only Python
- Built on Flask, React.js, Plotly.js
- Runs local server at http://127.0.0.1:8050/
- Interactive charts with hover, zoom, click
- Callbacks for user interaction

```python
from dash import Dash, html, dcc
import plotly.express as px

app = Dash(__name__)
fig = px.pie(values=[1245, 582], names=['AI', 'Human'], title='Code Authorship')

app.layout = html.Div([
    html.H1('AI Code Stats'),
    dcc.Graph(figure=fig)
])

if __name__ == '__main__':
    app.run_server(debug=True)
```

**Use case**: `wts stats --web` opens browser with full dashboard

#### Streamlit
**Best for**: Quick data apps, ML dashboards
**Install**: `pip install streamlit`

Features:
- Even simpler than Dash
- Hot reload during development
- Built-in widgets (sliders, selects)
- Free cloud deployment option

```python
import streamlit as st
import plotly.express as px

st.title('AI Code Stats')
fig = px.pie(values=[1245, 582], names=['AI', 'Human'])
st.plotly_chart(fig)
```

Run with: `streamlit run app.py`

#### Panel (HoloViz)
**Best for**: Complex dashboards, multiple plotting libraries
**Features**: Integrates Bokeh, Matplotlib, Plotly. More enterprise-focused.

#### Flask + Chart.js
**Best for**: Custom web apps
Roll your own with Flask backend + Chart.js frontend. More work but maximum control.

**Sources**:
- [Dash Real Python Tutorial](https://realpython.com/python-dash/)
- [PyViz Dashboarding Tools](https://pyviz.org/dashboarding/)
- [Python Dashboard Frameworks Comparison](https://www.planeks.net/python-dashboard-development-framework/)

---

### 4. Recommended Metrics and Visualizations

Based on research into git statistics visualization tools, these metrics are most useful:

#### Core Metrics

| Metric | Description | Best Visualization |
|--------|-------------|-------------------|
| **Total lines by source** | AI vs Human lines added/removed | Pie chart, stacked bar |
| **Percentage split** | AI% vs Human% | Pie chart, gauge |
| **Time series** | Changes over time | Line chart |
| **Per-repo breakdown** | Stats by repository | Horizontal bar chart |
| **Per-file breakdown** | Which files are AI-heavy | Table, treemap |

#### Visualization Types

**Pie Chart / Donut Chart**
- Best for: Overall AI vs Human split
- Shows proportion at a glance
- Example: "68% AI, 32% Human"

**Stacked Bar Chart**
- Best for: Per-repo or per-time-period comparison
- Shows total and breakdown together
- Example: Each bar = one repo, colors = AI/Human

**Time Series Line Chart**
- Best for: Trends over time
- Shows if AI usage is increasing/decreasing
- X-axis: weeks/months, Y-axis: lines or percentage

**Calendar Heatmap**
- Best for: Activity patterns (like GitHub contribution graph)
- Shows daily activity intensity
- Python library: `calmap`

**Horizontal Bar Chart**
- Best for: Ranking repos or files by AI content
- Easy to read file names
- Sort by AI percentage descending

**Table**
- Best for: Detailed breakdown, sortable columns
- Show: file, AI lines, human lines, AI%, total
- Rich tables work great for CLI

#### Example Stats Dashboard Layout

```
╭─────────────── AI Code Stats ───────────────╮
│                                              │
│  Overall (Last 30 days)                      │
│  ┌────────────┐                              │
│  │    AI 68%  │  Lines: 1,245 AI / 582 Human │
│  │   Human    │  Commits: 45                 │
│  │    32%     │  Repos: 3                    │
│  └────────────┘                              │
│                                              │
│  By Repository                               │
│  ai-toolbox     ████████████████░░░░ 82%    │
│  web-app        ████████████░░░░░░░░ 61%    │
│  scripts        ████░░░░░░░░░░░░░░░░ 23%    │
│                                              │
│  Weekly Trend                                │
│  100%│    ┌─┐                                │
│   50%│┌─┐ │ │ ┌─┐                            │
│    0%│└─┴─┴─┴─┴─┴─                           │
│      W1  W2  W3  W4                          │
╰──────────────────────────────────────────────╯
```

**Sources**:
- [Visualizing Git Statistics (Graphite)](https://graphite.com/guides/visualizing-git-statistics)
- [GitClear Gallery](https://www.gitclear.com/gallery_of_free_git_stats_screenshots_examples)
- [Git Stats VS Code Extension](https://github.com/lixianmin/git.stats)
- [GitHub Contributions Plot for Time Series](https://towardsdatascience.com/create-githubs-style-contributions-plot-for-your-time-series-data-79df84ec93da/)

---

## Recommended Implementation Path

### Phase 1: CLI with Rich (MVP)
```
pip install rich
```

Output format:
```
$ wts stats

AI Code Stats (Last 30 days)
┏━━━━━━━━━━━━━━┳━━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━┓
┃ Source       ┃ Lines Added ┃ Lines Del  ┃ Share   ┃
┡━━━━━━━━━━━━━━╇━━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━┩
│ AI (Claude)  │       1,245 │        312 │ 68%     │
│ Human        │         582 │        156 │ 32%     │
├──────────────┼─────────────┼────────────┼─────────┤
│ Total        │       1,827 │        468 │ 100%    │
└──────────────┴─────────────┴────────────┴─────────┘
```

### Phase 2: Add Terminal Charts with Plotext
```
pip install plotext
```

Output format:
```
$ wts stats --chart

[Table as above]

Lines Added by Source
┌──────────────────────────────────────┐
│████████████████████████████████ 1245 │ AI
│███████████████                  582  │ Human
└──────────────────────────────────────┘
```

### Phase 3: Add Web Dashboard (Optional)
```
pip install dash plotly
```

Command:
```
$ wts stats --web
Starting dashboard at http://localhost:8050...
```

Opens browser with interactive pie charts, time series, repo breakdown.

### Phase 4: Static HTML Export (Optional)
```
$ wts stats --export report.html
Exported to report.html
```

Generates self-contained HTML file that can be opened without server.

---

## Code References

Related existing research:
- `/Users/taras/Documents/code/ai-toolbox/thoughts/shared/research/2026-01-09-ai-vs-human-code-tracking.md` - Core tracking mechanism

## Architecture Notes

The visualization layer should be decoupled from data collection:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Data Layer     │────▶│  Stats Engine    │────▶│  Visualization  │
│  (jsonl files)  │     │  (aggregation)   │     │  (rich/plotext) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

This allows adding new visualization backends (web, HTML export) without changing data collection.

## Open Questions

1. Should the default output be minimal (just table) or include charts?
2. What time ranges to support? (today, week, month, all-time, custom)
3. Should we support JSON output for piping to other tools?
4. How granular should repo filtering be? (include/exclude patterns)

## Dependencies Summary

| Use Case | Dependencies |
|----------|--------------|
| Basic tables | `rich` |
| Terminal charts | `rich`, `plotext` |
| Interactive TUI | `textual`, `textual-plotext` |
| Web dashboard | `dash`, `plotly` |
| Static HTML | `plotly` (or `matplotlib`) |

Recommended minimal set: **`rich` + `plotext`** (~2MB total)
