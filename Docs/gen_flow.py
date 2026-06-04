"""
Flow diagram for CsvFolderImporter — produces a professional PNG.
Uses only matplotlib (no graphviz dependency).
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

# ─── Colours ──────────────────────────────────────────────────────────────────
C_PROC  = "#1F4E79"   # dark blue — process boxes
C_DEC   = "#2E7D32"   # dark green — decision diamonds
C_TERM  = "#4A235A"   # purple — start/end terminals
C_ERR   = "#C62828"   # red — error / failed path
C_OK    = "#1B5E20"   # deep green — success path
C_ARROW = "#37474F"   # arrow colour
C_BG    = "#F8FAFC"   # page background
C_LINE  = "#E0E0E0"   # light grid lines (unused here but kept for ref)

WHITE   = "white"
LBLUE   = "#E3F2FD"
LGREEN  = "#E8F5E9"
LRED    = "#FFEBEE"
LPURP   = "#F3E5F5"

FONT    = "DejaVu Sans"

fig, ax = plt.subplots(figsize=(14, 22))
fig.patch.set_facecolor(C_BG)
ax.set_facecolor(C_BG)
ax.set_xlim(0, 14)
ax.set_ylim(0, 22)
ax.axis('off')

# ─── Drawing helpers ──────────────────────────────────────────────────────────

def box(cx, cy, w, h, label, color, text_color=WHITE, fontsize=9.5, subtext=None):
    """Draw a rounded rectangle process box."""
    rect = FancyBboxPatch((cx - w/2, cy - h/2), w, h,
                          boxstyle="round,pad=0.05",
                          facecolor=color, edgecolor=WHITE,
                          linewidth=1.5, zorder=3)
    ax.add_patch(rect)
    y_text = cy if subtext is None else cy + 0.12
    ax.text(cx, y_text, label, ha='center', va='center',
            fontsize=fontsize, color=text_color, fontweight='bold',
            fontfamily=FONT, zorder=4, wrap=True,
            multialignment='center')
    if subtext:
        ax.text(cx, cy - 0.20, subtext, ha='center', va='center',
                fontsize=7.5, color=text_color, fontfamily=FONT, zorder=4,
                style='italic', multialignment='center')

def diamond(cx, cy, w, h, label, color=C_DEC, text_color=WHITE, fontsize=9):
    """Draw a diamond (decision)."""
    dx, dy = w/2, h/2
    pts = [(cx, cy+dy), (cx+dx, cy), (cx, cy-dy), (cx-dx, cy)]
    diamond_patch = plt.Polygon(pts, closed=True,
                                facecolor=color, edgecolor=WHITE, linewidth=1.5, zorder=3)
    ax.add_patch(diamond_patch)
    ax.text(cx, cy, label, ha='center', va='center',
            fontsize=fontsize, color=text_color, fontweight='bold',
            fontfamily=FONT, zorder=4, multialignment='center')

def terminal(cx, cy, w, h, label, color=C_TERM):
    """Draw a rounded terminal (stadium shape)."""
    rect = FancyBboxPatch((cx - w/2, cy - h/2), w, h,
                          boxstyle="round,pad=0.15",
                          facecolor=color, edgecolor=WHITE,
                          linewidth=2, zorder=3)
    ax.add_patch(rect)
    ax.text(cx, cy, label, ha='center', va='center',
            fontsize=10, color=WHITE, fontweight='bold',
            fontfamily=FONT, zorder=4)

def arrow(x1, y1, x2, y2, label='', color=C_ARROW, lw=1.8):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=color,
                                lw=lw, connectionstyle='arc3,rad=0'))
    if label:
        mx, my = (x1+x2)/2, (y1+y2)/2
        ax.text(mx + 0.08, my, label, fontsize=8, color=color,
                fontfamily=FONT, fontweight='bold', zorder=5)

def harrow(x1, y1, xmid, ymid, x2, y2, label='', color=C_ARROW, lw=1.8):
    """L-shaped arrow via an intermediate point."""
    ax.annotate('', xy=(xmid, ymid), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='-', color=color, lw=lw))
    ax.annotate('', xy=(x2, y2), xytext=(xmid, ymid),
                arrowprops=dict(arrowstyle='->', color=color, lw=lw))
    if label:
        ax.text(x1 + 0.1, (y1+ymid)/2, label, fontsize=8, color=color,
                fontfamily=FONT, fontweight='bold', zorder=5)

# ─── Title ────────────────────────────────────────────────────────────────────
ax.text(7, 21.4, "CSV Folder Importer", ha='center', va='center',
        fontsize=18, fontweight='bold', color=C_PROC, fontfamily=FONT)
ax.text(7, 21.05, "Import Process Flow", ha='center', va='center',
        fontsize=11, color="#546E7A", fontfamily=FONT, style='italic')
ax.plot([1, 13], [20.75, 20.75], color=C_PROC, lw=2)

# ─── Layout constants ─────────────────────────────────────────────────────────
CX    = 7.0     # main column centre
BW    = 3.8     # standard box width
BH    = 0.55    # standard box height
DW    = 3.2     # diamond width
DH    = 0.65    # diamond height

# Y positions (top to bottom)
Y = {
    'trigger_dec': 20.1,
    'watcher'    : 20.1,
    'timer'      : 20.1,
    'scan'       : 19.1,
    'files_dec'  : 18.2,
    'wait'       : 18.2,
    'read'       : 17.2,
    'read_dec'   : 16.35,
    'fail1'      : 16.35,
    'table_dec'  : 15.4,
    'create'     : 14.65,
    'truncate'   : 14.65,
    'bulk'       : 13.7,
    'insert_dec' : 12.85,
    'fail2'      : 12.85,
    'success'    : 12.0,
    'log_ok'     : 11.2,
    'next'       : 10.5,
    'done'       : 9.7,
}

ERR_X = 11.2   # x for error path boxes

# ─── Draw nodes ───────────────────────────────────────────────────────────────

# Trigger sources
terminal(4.5, Y['trigger_dec'], 2.4, 0.5, "FileSystemWatcher\nEvent", color="#4A235A")
terminal(9.5, Y['trigger_dec'], 2.4, 0.5, "Poll Timer\nFires", color="#4A235A")

# Merge arrow targets
box(CX, Y['scan'],      BW, BH, "Scan All Non-Reserved Subfolders", C_PROC,
    subtext="(skips folders starting with _)")

# Decision: files found?
diamond(CX, Y['files_dec'], DW, DH, "CSV or Excel\nFiles Found?", C_DEC)

# Wait (No branch)
terminal(ERR_X, Y['wait'], 2.4, 0.5, "Wait for Next\nEvent / Timer", color="#546E7A")

# Read file
box(CX, Y['read'],     BW, BH, "Read File", C_PROC,
    subtext="CsvHelper (CSV)  |  ExcelDataReader (XLSX / XLS)")

# Decision: read OK?
diamond(CX, Y['read_dec'], DW, DH, "Read\nSuccessful?", C_DEC)

# Fail 1
box(ERR_X, Y['fail1'], 2.6, 0.5, "Move to _Failed\n(timestamped filename)", C_ERR)

# Decision: table exists?
diamond(CX, Y['table_dec'], DW, DH, "SQL Table\nExists?", C_DEC)

# Create table
box(CX - 2.3, Y['create'], 2.0, 0.5, "CREATE TABLE\n(from header row)", C_PROC)

# Truncate table
box(CX + 2.3, Y['truncate'], 2.0, 0.5, "TRUNCATE TABLE\n(preserve schema)", C_PROC)

# Bulk insert
box(CX, Y['bulk'],     BW, BH, "SqlBulkCopy — Insert All Rows", C_PROC)

# Decision: insert OK?
diamond(CX, Y['insert_dec'], DW, DH, "Insert\nSuccessful?", C_DEC)

# Fail 2
box(ERR_X, Y['fail2'], 2.6, 0.5, "Move to _Failed\n(timestamped filename)", C_ERR)

# Success
box(CX, Y['success'],  BW, BH, "Move to _Success\n(timestamped filename)", "#2E7D32")

# Log success
box(CX, Y['log_ok'],   BW, BH, "Log: Import complete\n(rows imported, table name)", "#1565C0")

# Next file
terminal(CX, Y['next'], BW, 0.5, "Next File in Folder?", color="#37474F")

# Done
terminal(CX, Y['done'], BW, 0.5, "Done — Await Next Trigger", C_TERM)

# ─── Log error boxes (attached to fail paths) ─────────────────────────────────
LOG_ERR_Y1 = Y['fail1'] - 0.75
LOG_ERR_Y2 = Y['fail2'] - 0.75
box(ERR_X, LOG_ERR_Y1, 2.6, 0.48, "Log: Error\n(message + file path)", "#B71C1C")
box(ERR_X, LOG_ERR_Y2, 2.6, 0.48, "Log: Error\n(message + file path)", "#B71C1C")

# ─── Arrows ───────────────────────────────────────────────────────────────────

# Both triggers → scan
arrow(4.5, Y['trigger_dec'] - 0.25, CX - 0.5, Y['scan'] + BH/2, color=C_PROC, lw=1.5)
arrow(9.5, Y['trigger_dec'] - 0.25, CX + 0.5, Y['scan'] + BH/2, color=C_PROC, lw=1.5)

# Scan → files decision
arrow(CX, Y['scan'] - BH/2, CX, Y['files_dec'] + DH/2)

# Files No → wait
harrow(CX + DW/2, Y['files_dec'], ERR_X, Y['files_dec'], ERR_X, Y['wait'] + 0.25, 'No', "#546E7A")

# Files Yes → read
arrow(CX, Y['files_dec'] - DH/2, CX, Y['read'] + BH/2, 'Yes')

# Read → read decision
arrow(CX, Y['read'] - BH/2, CX, Y['read_dec'] + DH/2)

# Read No → fail1
harrow(CX + DW/2, Y['read_dec'], ERR_X, Y['read_dec'], ERR_X, Y['fail1'] + BH/2, 'No', C_ERR)

# fail1 → log err 1
arrow(ERR_X, Y['fail1'] - BH/2, ERR_X, LOG_ERR_Y1 + 0.24, color="#B71C1C")

# log err 1 → next file (L-shape back to main column)
harrow(ERR_X, LOG_ERR_Y1 - 0.24, ERR_X, Y['next'] + 0.2, CX + BW/2, Y['next'] + 0.2, color="#B71C1C")

# Read Yes → table decision
arrow(CX, Y['read_dec'] - DH/2, CX, Y['table_dec'] + DH/2, 'Yes')

# Table No → create
harrow(CX, Y['table_dec'] - DH/2, CX - 2.3, Y['table_dec'] - DH/2 - 0.12,
       CX - 2.3, Y['create'] + BH/2, 'No', C_PROC)

# Table Yes → truncate
harrow(CX, Y['table_dec'] - DH/2, CX + 2.3, Y['table_dec'] - DH/2 - 0.12,
       CX + 2.3, Y['truncate'] + BH/2, 'Yes', C_PROC)

# Create → bulk (left branch merge)
harrow(CX - 2.3, Y['create'] - BH/2, CX - 2.3, Y['bulk'] + BH/2 + 0.05,
       CX - BW/2, Y['bulk'] + BH/2 + 0.05, color=C_PROC)
# connect to bulk left edge
arrow(CX - BW/2, Y['bulk'] + BH/2 + 0.05, CX - BW/2, Y['bulk'], color=C_PROC)

# Truncate → bulk (right branch merge)
harrow(CX + 2.3, Y['truncate'] - BH/2, CX + 2.3, Y['bulk'] + BH/2 + 0.05,
       CX + BW/2, Y['bulk'] + BH/2 + 0.05, color=C_PROC)
arrow(CX + BW/2, Y['bulk'] + BH/2 + 0.05, CX + BW/2, Y['bulk'], color=C_PROC)

# Bulk → insert decision
arrow(CX, Y['bulk'] - BH/2, CX, Y['insert_dec'] + DH/2)

# Insert No → fail2
harrow(CX + DW/2, Y['insert_dec'], ERR_X, Y['insert_dec'], ERR_X, Y['fail2'] + BH/2, 'No', C_ERR)

# fail2 → log err 2
arrow(ERR_X, Y['fail2'] - BH/2, ERR_X, LOG_ERR_Y2 + 0.24, color="#B71C1C")

# log err 2 → next file
harrow(ERR_X, LOG_ERR_Y2 - 0.24, ERR_X, Y['next'] - 0.2, CX + BW/2, Y['next'] - 0.2, color="#B71C1C")

# Insert Yes → success
arrow(CX, Y['insert_dec'] - DH/2, CX, Y['success'] + BH/2, 'Yes')

# Success → log ok
arrow(CX, Y['success'] - BH/2, CX, Y['log_ok'] + BH/2)

# Log ok → next
arrow(CX, Y['log_ok'] - BH/2, CX, Y['next'] + 0.25)

# Next → loop back (Yes → scan)
harrow(CX - BW/2, Y['next'], 2.2, Y['next'], 2.2, Y['scan'], 'Yes', C_PROC)
arrow(2.2, Y['scan'], CX - BW/2, Y['scan'], color=C_PROC)

# Next → done (No)
arrow(CX, Y['next'] - 0.25, CX, Y['done'] + 0.25, 'No')

# ─── Legend ───────────────────────────────────────────────────────────────────
LX, LY = 0.4, 6.5
ax.text(LX, LY + 0.4, "Legend", fontsize=9, fontweight='bold', color="#37474F", fontfamily=FONT)
items = [
    (C_PROC, "Process"),
    (C_DEC,  "Decision"),
    (C_TERM, "Start / End"),
    (C_ERR,  "Error / Failure"),
    ("#2E7D32", "Success"),
    ("#1565C0", "Logging"),
]
for i, (col, lbl) in enumerate(items):
    yy = LY - i * 0.38
    rect = FancyBboxPatch((LX, yy - 0.12), 0.55, 0.26,
                          boxstyle="round,pad=0.03",
                          facecolor=col, edgecolor='white', linewidth=1, zorder=3)
    ax.add_patch(rect)
    ax.text(LX + 0.7, yy + 0.01, lbl, fontsize=8, color="#37474F", fontfamily=FONT, va='center')

ax.plot([0.2, 3.4], [LY + 0.65, LY + 0.65], color=C_PROC, lw=1.2)
ax.plot([0.2, 3.4], [LY - 2.0,  LY - 2.0],  color=C_LINE, lw=0.8)

# ─── Footer line ──────────────────────────────────────────────────────────────
ax.plot([0.5, 13.5], [0.5, 0.5], color=C_PROC, lw=1.5)
ax.text(7, 0.28, "CSV Folder Importer — Import Process Flow  |  " +
        __import__('datetime').date.today().strftime("%B %d, %Y"),
        ha='center', va='center', fontsize=7.5, color="#546E7A", fontfamily=FONT)

plt.tight_layout(pad=0)
out = r"C:\ClaudeOutput\CsvFolderImporter\Docs\CsvFolderImporter_Flow_Diagram.png"
plt.savefig(out, dpi=180, bbox_inches='tight', facecolor=C_BG)
plt.close()
print(f"Flow diagram saved: {out}")
