mod tasks;
mod ui;

use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use crossterm::event::{Event, KeyCode, KeyEventKind};
use crossterm::terminal::{disable_raw_mode, enable_raw_mode};
use crossterm::{execute, terminal};
use notify::Watcher;

use crate::tasks::{load_tasks, LoadedTasks};
use crate::ui::{draw, Modal, UiTheme, ViewState};

const DEFAULT_TASKS_PATH: &str = "../2026-01-11-haakpatronenbuddy/TASKS.toml";

fn main() -> Result<()> {
    let file_path = parse_args();
    run(file_path)
}

fn parse_args() -> PathBuf {
    let mut args = std::env::args().skip(1);
    if let Some(p) = args.next() {
        return PathBuf::from(p);
    }
    PathBuf::from(DEFAULT_TASKS_PATH)
}

fn run(file_path: PathBuf) -> Result<()> {
    let canonical = std::fs::canonicalize(&file_path).unwrap_or(file_path);

    enable_raw_mode().context("enable raw mode")?;
    let mut stdout = std::io::stdout();
    execute!(stdout, terminal::EnterAlternateScreen).context("enter alt screen")?;
    execute!(stdout, crossterm::cursor::Hide).ok();

    let backend = ratatui::backend::CrosstermBackend::new(stdout);
    let mut terminal = ratatui::Terminal::new(backend).context("create terminal")?;
    terminal.clear().ok();

    let (watch_tx, watch_rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher = notify::recommended_watcher(move |res| {
        let _ = watch_tx.send(res);
    })
    .context("create file watcher")?;
    watcher
        .watch(&canonical, notify::RecursiveMode::NonRecursive)
        .with_context(|| format!("watch {}", canonical.display()))?;

    let theme = UiTheme::default();
    let mut view = ViewState {
        selected_idx: 0,
        details_scroll: 0,
        modal: None,
    };

    let mut loaded: Option<LoadedTasks> = None;
    let mut last_error: Option<String> = None;
    let mut last_content_hash: Option<u64> = None;

    let mut reload_requested_at: Option<Instant> = Some(Instant::now());
    let debounce = Duration::from_millis(200);
    let auto_refresh = Duration::from_secs(60);
    let mut last_load_attempt = Instant::now();
    let tick_rate = Duration::from_millis(120);
    let mut last_tick = Instant::now();

    let result = (|| -> Result<()> {
        loop {
            drain_watcher(&watch_rx, &mut reload_requested_at, &mut last_error);

            if reload_requested_at.is_none() && last_load_attempt.elapsed() >= auto_refresh {
                reload_requested_at = Some(Instant::now());
            }

            if let Some(t0) = reload_requested_at {
                if t0.elapsed() >= debounce {
                    reload_requested_at = None;
                    last_load_attempt = Instant::now();
                    match load_tasks(&canonical) {
                        Ok(next) => {
                            if let Some(prev) = last_content_hash {
                                if prev != next.content_hash {
                                    chime();
                                }
                            }
                            last_content_hash = Some(next.content_hash);
                            loaded = Some(next);
                            last_error = None;
                            if let Some(l) = &loaded {
                                if !l.tasks.tasks.is_empty() {
                                    view.selected_idx =
                                        view.selected_idx.min(l.tasks.tasks.len() - 1);
                                } else {
                                    view.selected_idx = 0;
                                }
                            }
                        }
                        Err(e) => {
                            last_error = Some(e.to_string());
                        }
                    }
                }
            }

            draw(
                &mut terminal,
                &theme,
                &view,
                loaded.as_ref(),
                last_error.as_deref(),
            )?;

            let timeout = tick_rate.saturating_sub(last_tick.elapsed());
            if crossterm::event::poll(timeout).context("poll events")? {
                if let Event::Key(key) = crossterm::event::read().context("read event")? {
                    if key.kind == KeyEventKind::Press {
                        if handle_key(
                            key.code,
                            &mut view,
                            loaded.as_ref(),
                            &mut reload_requested_at,
                        )? {
                            break;
                        }
                    }
                }
            }

            if last_tick.elapsed() >= tick_rate {
                last_tick = Instant::now();
            }
        }

        Ok(())
    })();

    restore_terminal()?;
    result
}

fn restore_terminal() -> Result<()> {
    disable_raw_mode().ok();
    execute!(std::io::stdout(), terminal::LeaveAlternateScreen).ok();
    execute!(std::io::stdout(), crossterm::cursor::Show).ok();
    Ok(())
}

fn chime() {
    use std::io::Write;
    let mut out = std::io::stdout();
    let _ = out.write_all(b"\x07");
    let _ = out.flush();
}

fn drain_watcher(
    watch_rx: &mpsc::Receiver<notify::Result<notify::Event>>,
    reload_requested_at: &mut Option<Instant>,
    last_error: &mut Option<String>,
) {
    loop {
        match watch_rx.try_recv() {
            Ok(Ok(_event)) => {
                *reload_requested_at = Some(Instant::now());
            }
            Ok(Err(e)) => {
                *last_error = Some(format!("watcher error: {e}"));
            }
            Err(mpsc::TryRecvError::Empty) => break,
            Err(mpsc::TryRecvError::Disconnected) => break,
        }
    }
}

fn handle_key(
    code: KeyCode,
    view: &mut ViewState,
    loaded: Option<&LoadedTasks>,
    reload_requested_at: &mut Option<Instant>,
) -> Result<bool> {
    match code {
        KeyCode::Char('q') => return Ok(true),
        KeyCode::Char('?') => {
            view.modal = match view.modal {
                Some(Modal::Help) => None,
                _ => Some(Modal::Help),
            };
        }
        KeyCode::Char('r') => {
            *reload_requested_at = Some(Instant::now());
        }
        KeyCode::Up => {
            view.details_scroll = 0;
            view.selected_idx = view.selected_idx.saturating_sub(1);
        }
        KeyCode::Down => {
            view.details_scroll = 0;
            let max = loaded.map(|l| l.tasks.tasks.len()).unwrap_or(0);
            if max > 0 {
                view.selected_idx = (view.selected_idx + 1).min(max - 1);
            }
        }
        KeyCode::PageUp => {
            view.details_scroll = view.details_scroll.saturating_sub(4);
        }
        KeyCode::PageDown => {
            view.details_scroll = view.details_scroll.saturating_add(4);
        }
        KeyCode::Home => {
            view.details_scroll = 0;
            view.selected_idx = 0;
        }
        KeyCode::End => {
            view.details_scroll = 0;
            let max = loaded.map(|l| l.tasks.tasks.len()).unwrap_or(0);
            if max > 0 {
                view.selected_idx = max - 1;
            }
        }
        _ => {}
    }

    if view.modal.is_some() {
        // Keep selection/scroll keys functioning behind the modal? For now, no.
    }

    Ok(false)
}
