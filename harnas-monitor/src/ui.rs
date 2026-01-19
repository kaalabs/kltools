use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{
    Block, BorderType, Borders, Cell, Clear, Gauge, Paragraph, Row, Table, TableState,
};
use ratatui::{Frame, Terminal};

use crate::tasks::{normalize_status, LoadedTasks, Task};

pub struct UiTheme {
    pub border: Style,
    pub title: Style,
    pub ok: Style,
    pub warn: Style,
    pub err: Style,
    pub selected: Style,
    pub dim: Style,
}

impl Default for UiTheme {
    fn default() -> Self {
        Self {
            border: Style::default().fg(Color::DarkGray),
            title: Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            ok: Style::default().fg(Color::Green),
            warn: Style::default().fg(Color::Yellow),
            err: Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
            selected: Style::default()
                .bg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
            dim: Style::default().fg(Color::DarkGray),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum Modal {
    Help,
}

#[derive(Debug)]
pub struct ViewState {
    pub selected_idx: usize,
    pub details_scroll: u16,
    pub modal: Option<Modal>,
}

pub fn draw<B: ratatui::backend::Backend>(
    terminal: &mut Terminal<B>,
    theme: &UiTheme,
    view: &ViewState,
    loaded: Option<&LoadedTasks>,
    last_error: Option<&str>,
) -> anyhow::Result<()> {
    terminal.draw(|f| {
        let root = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(6), Constraint::Min(1), Constraint::Length(2)])
            .split(f.area());

        draw_header(f, theme, root[0], loaded, last_error);
        draw_body(f, theme, view, root[1], loaded);
        draw_footer(f, theme, root[2], loaded);

        if view.modal.is_some() {
            draw_help_modal(f, theme, f.area());
        }
    })?;
    Ok(())
}

fn draw_header(
    f: &mut Frame<'_>,
    theme: &UiTheme,
    area: Rect,
    loaded: Option<&LoadedTasks>,
    last_error: Option<&str>,
) {
    let block = Block::default()
        .title(Line::from(vec![
            Span::styled("harnas-monitor", theme.title),
            Span::raw("  "),
            Span::styled("TASKS.toml dashboard (read-only)", theme.dim),
        ]))
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(theme.border);

    let inner = block.inner(area);
    f.render_widget(block, area);

    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(40), Constraint::Length(36)])
        .split(inner);
    let left = chunks[0];
    let right = chunks[1];

    let mut lines: Vec<Line> = Vec::new();
    if let Some(l) = loaded {
        let meta = l.tasks.meta.as_ref();
        let spec = meta
            .and_then(|m| m.spec_version.as_deref())
            .unwrap_or("?");
        let spec_file = meta
            .and_then(|m| m.spec_file.as_deref())
            .unwrap_or("?");
        let output_file = meta
            .and_then(|m| m.output_file.as_deref())
            .unwrap_or("?");
        let gen = meta
            .and_then(|m| m.generated_utc.as_deref())
            .unwrap_or("?");
        lines.push(Line::from(vec![
            Span::styled("File: ", theme.dim),
            Span::raw(l.path.clone()),
        ]));
        lines.push(Line::from(vec![
            Span::styled("Spec: ", theme.dim),
            Span::raw(spec.to_string()),
            Span::styled(" (", theme.dim),
            Span::raw(spec_file.to_string()),
            Span::styled(")", theme.dim),
            Span::styled("  Output: ", theme.dim),
            Span::raw(output_file.to_string()),
            Span::styled("  Generated: ", theme.dim),
            Span::raw(gen.to_string()),
        ]));
        lines.push(Line::from(vec![
            Span::styled("mtime: ", theme.dim),
            Span::raw(
                l.file_mtime
                    .map(humantime::format_rfc3339_seconds)
                    .map(|d| d.to_string())
                    .unwrap_or_else(|| "?".to_string()),
            ),
            Span::styled("  loaded_at: ", theme.dim),
            Span::raw(humantime::format_rfc3339_seconds(l.loaded_at).to_string()),
        ]));

        if let Some(err) = last_error {
            lines.push(Line::from(vec![
                Span::styled("Last load error: ", theme.dim),
                Span::styled(truncate(err, left.width as usize - 18), theme.err),
            ]));
        } else {
            lines.push(Line::from(vec![
                Span::styled("Last load: ", theme.dim),
                Span::styled("OK", theme.ok),
            ]));
        }
    } else if let Some(err) = last_error {
        lines.push(Line::from(vec![
            Span::styled("Load error: ", theme.dim),
            Span::styled(truncate(err, left.width as usize - 12), theme.err),
        ]));
    } else {
        lines.push(Line::from(vec![
            Span::styled("Waiting for first load…", theme.dim),
        ]));
    }

    f.render_widget(Paragraph::new(lines).block(Block::default()), left);

    let (done, total, blocked, missing) = loaded
        .map(|l| {
            (
                l.stats.done,
                l.stats.total,
                l.stats.blocked_by_deps,
                l.stats.missing_deps,
            )
        })
        .unwrap_or((0, 0, 0, 0));

    let ratio = if total == 0 {
        0.0
    } else {
        (done as f64) / (total as f64)
    };
    let label = format!(
        "{done}/{total} done ({:.0}%) | {blocked} blocked | {missing} missing deps",
        ratio * 100.0
    );

    let label = Span::styled(
        label,
        Style::default()
            .fg(Color::Black)
            .bg(Color::Green)
            .add_modifier(Modifier::BOLD),
    );
    let gauge = Gauge::default()
        .block(
            Block::default()
                .title(Span::styled("Progress", theme.dim))
                .borders(Borders::ALL)
                .border_style(theme.border),
        )
        .gauge_style(Style::default().fg(Color::Green))
        .ratio(ratio)
        .label(label);

    f.render_widget(gauge, right);
}

fn draw_body(
    f: &mut Frame<'_>,
    theme: &UiTheme,
    view: &ViewState,
    area: Rect,
    loaded: Option<&LoadedTasks>,
) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(55), Constraint::Percentage(45)])
        .split(area);
    let left = chunks[0];
    let right = chunks[1];

    draw_task_table(f, theme, view.selected_idx, left, loaded);
    draw_details(f, theme, view, right, loaded);
}

fn draw_task_table(
    f: &mut Frame<'_>,
    theme: &UiTheme,
    selected_idx: usize,
    area: Rect,
    loaded: Option<&LoadedTasks>,
) {
    let mut rows: Vec<Row> = Vec::new();

    let tasks: &[Task] = loaded.map(|l| l.tasks.tasks.as_slice()).unwrap_or(&[]);
    let mut status_by_id: std::collections::HashMap<&str, String> = std::collections::HashMap::new();
    for t in tasks {
        let status = t
            .status
            .as_deref()
            .map(normalize_status)
            .unwrap_or_else(|| "unknown".to_string());
        status_by_id.insert(t.id.as_str(), status);
    }

    for (_idx, t) in tasks.iter().enumerate() {
        let status = t
            .status
            .as_deref()
            .map(normalize_status)
            .unwrap_or_else(|| "unknown".to_string());
        let prio = t
            .priority
            .as_deref()
            .map(|p| p.to_lowercase())
            .unwrap_or_else(|| "unknown".to_string());
        let comp = t
            .component
            .as_deref()
            .map(|c| c.to_lowercase())
            .unwrap_or_else(|| "unknown".to_string());

        let waiting_on = t
            .depends_on
            .iter()
            .filter(|dep| matches!(status_by_id.get(dep.as_str()), Some(s) if s != "done"))
            .count();
        let waiting_cell = if t.depends_on.is_empty() {
            Cell::from(Span::styled("-", theme.dim))
        } else if waiting_on == 0 {
            Cell::from(Span::styled("0", theme.ok))
        } else {
            Cell::from(Span::styled(waiting_on.to_string(), theme.warn))
        };

        let status_style = match status.as_str() {
            "done" => theme.ok,
            "in_progress" => Style::default().fg(Color::Cyan),
            "blocked" => theme.warn,
            "todo" => Style::default().fg(Color::White),
            _ => theme.dim,
        };

        rows.push(
            Row::new(vec![
                Cell::from(t.id.clone()),
                Cell::from(Span::styled(status, status_style)),
                waiting_cell,
                Cell::from(prio),
                Cell::from(comp),
                Cell::from(truncate(&t.title, 70)),
            ])
            .style(Style::default()),
        );
    }

    let table = Table::new(
        rows,
        [
            Constraint::Length(8),
            Constraint::Length(12),
            Constraint::Length(5),
            Constraint::Length(8),
            Constraint::Length(10),
            Constraint::Min(20),
        ],
    )
    .header(
        Row::new(vec!["ID", "Status", "Wait", "Prio", "Comp", "Title"])
            .style(theme.dim)
            .bottom_margin(0),
    )
    .block(
        Block::default()
            .title(Span::styled("Tasks", theme.title))
            .borders(Borders::ALL)
            .border_style(theme.border),
    )
    .row_highlight_style(theme.selected);

    let mut state = TableState::default();
    if !tasks.is_empty() {
        let selected_idx = selected_idx.min(tasks.len() - 1);
        state.select(Some(selected_idx));

        // Keep the selected row near the middle of the viewport once possible, so scrolling down
        // reveals upcoming rows while the cursor stays in view.
        let viewport_rows = area
            .height
            .saturating_sub(2) // borders
            .saturating_sub(1); // header row
        let offset = compute_table_offset(selected_idx, tasks.len(), viewport_rows as usize);
        state = state.with_offset(offset);
    }
    f.render_stateful_widget(table, area, &mut state);
}

fn compute_table_offset(selected: usize, rows: usize, viewport_rows: usize) -> usize {
    if viewport_rows == 0 || rows <= viewport_rows {
        return 0;
    }
    let mid = viewport_rows / 2;
    let desired = selected.saturating_sub(mid);
    let max_offset = rows - viewport_rows;
    desired.min(max_offset)
}

fn draw_details(
    f: &mut Frame<'_>,
    theme: &UiTheme,
    view: &ViewState,
    area: Rect,
    loaded: Option<&LoadedTasks>,
) {
    let block = Block::default()
        .title(Span::styled("Details", theme.title))
        .borders(Borders::ALL)
        .border_style(theme.border);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let Some(loaded) = loaded else {
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(
                "No data loaded yet.",
                theme.dim,
            ))),
            inner,
        );
        return;
    };
    if loaded.tasks.tasks.is_empty() {
        f.render_widget(
            Paragraph::new(Line::from(Span::styled("No tasks.", theme.dim))),
            inner,
        );
        return;
    }

    let idx = view.selected_idx.min(loaded.tasks.tasks.len() - 1);
    let t = &loaded.tasks.tasks[idx];
    let mut text = Text::default();

    text.lines.push(Line::from(vec![
        Span::styled(&t.id, theme.title),
        Span::raw("  "),
        Span::raw(&t.title),
    ]));

    let status = t
        .status
        .as_deref()
        .map(normalize_status)
        .unwrap_or_else(|| "unknown".to_string());
    let prio = t.priority.as_deref().unwrap_or("unknown");
    let comp = t.component.as_deref().unwrap_or("unknown");

    text.lines.push(Line::from(vec![
        Span::styled("status: ", theme.dim),
        Span::raw(status),
        Span::styled("  priority: ", theme.dim),
        Span::raw(prio.to_string()),
        Span::styled("  component: ", theme.dim),
        Span::raw(comp.to_string()),
    ]));

    if !t.depends_on.is_empty() {
        text.lines.push(Line::from(vec![
            Span::styled("depends_on: ", theme.dim),
            Span::raw(t.depends_on.join(", ")),
        ]));
    }
    if !t.spec_refs.is_empty() {
        text.lines.push(Line::from(vec![
            Span::styled("spec_refs: ", theme.dim),
            Span::raw(t.spec_refs.join(", ")),
        ]));
    }

    if let Some(est) = t.estimate_days {
        text.lines.push(Line::from(vec![
            Span::styled("estimate_days: ", theme.dim),
            Span::raw(format!("{est:.2}")),
        ]));
    }

    if let Some(summary) = t.summary.as_deref().filter(|s| !s.trim().is_empty()) {
        text.lines.push(Line::from(""));
        text.lines
            .push(Line::from(Span::styled("summary", theme.dim)));
        text.lines.push(Line::from(summary.to_string()));
    }

    if !t.deliverables.is_empty() {
        text.lines.push(Line::from(""));
        text.lines
            .push(Line::from(Span::styled("deliverables", theme.dim)));
        for d in t.deliverables.iter().take(8) {
            text.lines.push(Line::from(format!("• {d}")));
        }
        if t.deliverables.len() > 8 {
            text.lines.push(Line::from(Span::styled(
                format!("… (+{} more)", t.deliverables.len() - 8),
                theme.dim,
            )));
        }
    }

    if !t.dod.is_empty() {
        text.lines.push(Line::from(""));
        text.lines.push(Line::from(Span::styled("DoD", theme.dim)));
        for d in t.dod.iter().take(6) {
            text.lines.push(Line::from(format!("• {d}")));
        }
        if t.dod.len() > 6 {
            text.lines.push(Line::from(Span::styled(
                format!("… (+{} more)", t.dod.len() - 6),
                theme.dim,
            )));
        }
    }

    if let Some(notes) = t.notes.as_deref().filter(|s| !s.trim().is_empty()) {
        text.lines.push(Line::from(""));
        text.lines.push(Line::from(Span::styled("notes", theme.dim)));
        text.lines.push(Line::from(notes.to_string()));
    }

    let p = Paragraph::new(text)
        .scroll((view.details_scroll, 0))
        .wrap(ratatui::widgets::Wrap { trim: false });
    f.render_widget(p, inner);
}

fn draw_footer(f: &mut Frame<'_>, theme: &UiTheme, area: Rect, loaded: Option<&LoadedTasks>) {
    let mut line = vec![
        Span::styled("q", theme.title),
        Span::styled(" quit  ", theme.dim),
        Span::styled("↑/↓", theme.title),
        Span::styled(" select  ", theme.dim),
        Span::styled("PgUp/PgDn", theme.title),
        Span::styled(" scroll details  ", theme.dim),
        Span::styled("r", theme.title),
        Span::styled(" reload  ", theme.dim),
        Span::styled("?", theme.title),
        Span::styled(" help", theme.dim),
    ];

    if let Some(l) = loaded {
        line.push(Span::styled("   |   ", theme.dim));
        let status_summary = summarize_map(&l.stats.by_status, 3);
        line.push(Span::styled("statuses: ", theme.dim));
        line.push(Span::raw(status_summary));
    }

    let block = Block::default().borders(Borders::NONE);
    f.render_widget(Paragraph::new(Line::from(line)).block(block), area);
}

fn draw_help_modal(f: &mut Frame<'_>, theme: &UiTheme, area: Rect) {
    let modal_area = centered_rect(70, 65, area);
    f.render_widget(Clear, modal_area);

    let block = Block::default()
        .title(Span::styled("Help", theme.title))
        .borders(Borders::ALL)
        .border_style(theme.border)
        .border_type(BorderType::Rounded);
    let inner = block.inner(modal_area);
    f.render_widget(block, modal_area);

    let text = vec![
        Line::from(vec![
            Span::styled("Read-only dashboard for a sibling ", theme.dim),
            Span::styled("TASKS.toml", theme.title),
            Span::styled(" file.", theme.dim),
        ]),
        Line::from(""),
        Line::from("Keys:"),
        Line::from(vec![
            Span::styled("  q", theme.title),
            Span::raw(" quit"),
        ]),
        Line::from(vec![
            Span::styled("  r", theme.title),
            Span::raw(" reload now"),
        ]),
        Line::from(vec![
            Span::styled("  ↑/↓", theme.title),
            Span::raw(" select task"),
        ]),
        Line::from(vec![
            Span::styled("  PgUp/PgDn", theme.title),
            Span::raw(" scroll details pane"),
        ]),
        Line::from(vec![
            Span::styled("  ?", theme.title),
            Span::raw(" toggle this help"),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Auto reload", theme.title),
            Span::raw(": watches file changes and refreshes."),
        ]),
    ];

    f.render_widget(Paragraph::new(text).wrap(ratatui::widgets::Wrap { trim: true }), inner);
}

fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints(
            [
                Constraint::Percentage((100 - percent_y) / 2),
                Constraint::Percentage(percent_y),
                Constraint::Percentage((100 - percent_y) / 2),
            ]
            .as_ref(),
        )
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints(
            [
                Constraint::Percentage((100 - percent_x) / 2),
                Constraint::Percentage(percent_x),
                Constraint::Percentage((100 - percent_x) / 2),
            ]
            .as_ref(),
        )
        .split(popup_layout[1])[1]
}

fn truncate(s: &str, max: usize) -> String {
    if max == 0 {
        return String::new();
    }
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out = String::new();
    for (i, ch) in s.chars().enumerate() {
        if i + 1 >= max {
            break;
        }
        out.push(ch);
    }
    out.push('…');
    out
}

fn summarize_map(map: &std::collections::BTreeMap<String, usize>, max_items: usize) -> String {
    let mut parts: Vec<String> = map.iter().map(|(k, v)| format!("{k}:{v}")).collect();
    if parts.len() > max_items {
        let extra = parts.len() - max_items;
        parts.truncate(max_items);
        parts.push(format!("+{extra}"));
    }
    parts.join("  ")
}
