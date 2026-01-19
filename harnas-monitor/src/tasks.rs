use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;
use std::time::SystemTime;

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct TaskFile {
    pub meta: Option<Meta>,
    #[serde(default)]
    pub tasks: Vec<Task>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Meta {
    pub spec_file: Option<String>,
    pub spec_version: Option<String>,
    pub output_file: Option<String>,
    pub generated_utc: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub component: Option<String>,
    pub priority: Option<String>,
    pub status: Option<String>,
    #[serde(default)]
    pub spec_refs: Vec<String>,
    #[serde(default)]
    pub depends_on: Vec<String>,
    pub summary: Option<String>,
    #[serde(default)]
    pub deliverables: Vec<String>,
    pub estimate_days: Option<f64>,
    #[serde(default)]
    pub dod: Vec<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LoadedTasks {
    pub path: String,
    pub file_mtime: Option<SystemTime>,
    pub loaded_at: SystemTime,
    pub content_hash: u64,
    pub tasks: TaskFile,
    pub stats: Stats,
}

#[derive(Debug, Clone, Default)]
pub struct Stats {
    pub total: usize,
    pub done: usize,
    pub blocked_by_deps: usize,
    pub missing_deps: usize,
    pub by_status: BTreeMap<String, usize>,
    pub by_priority: BTreeMap<String, usize>,
    pub by_component: BTreeMap<String, usize>,
}

pub fn load_tasks(path: &Path) -> Result<LoadedTasks> {
    let contents = std::fs::read_to_string(path)
        .with_context(|| format!("reading {}", path.display()))?;
    let content_hash = fnv1a_64(contents.as_bytes());
    let parsed: TaskFile =
        toml::from_str(&contents).map_err(|e| anyhow!("parsing TOML: {e}"))?;

    let file_mtime = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok());

    let stats = compute_stats(&parsed);

    Ok(LoadedTasks {
        path: path.display().to_string(),
        file_mtime,
        loaded_at: SystemTime::now(),
        content_hash,
        tasks: parsed,
        stats,
    })
}

pub fn normalize_status(raw: &str) -> String {
    raw.trim().to_lowercase().replace('-', "_")
}

fn compute_stats(file: &TaskFile) -> Stats {
    let mut stats = Stats::default();
    stats.total = file.tasks.len();

    let mut status_by_id = HashMap::<&str, String>::new();
    for t in &file.tasks {
        let status = t
            .status
            .as_deref()
            .map(normalize_status)
            .unwrap_or_else(|| "unknown".to_string());
        status_by_id.insert(&t.id, status);
    }

    let all_ids: HashSet<&str> = file.tasks.iter().map(|t| t.id.as_str()).collect();
    let mut missing_deps: HashSet<String> = HashSet::new();

    for t in &file.tasks {
        let status = t
            .status
            .as_deref()
            .map(normalize_status)
            .unwrap_or_else(|| "unknown".to_string());
        *stats.by_status.entry(status.clone()).or_insert(0) += 1;

        if status == "done" {
            stats.done += 1;
        }

        if let Some(prio) = t.priority.as_deref().map(|p| p.trim()).filter(|p| !p.is_empty()) {
            *stats.by_priority.entry(prio.to_lowercase()).or_insert(0) += 1;
        } else {
            *stats.by_priority.entry("unknown".to_string()).or_insert(0) += 1;
        }

        if let Some(comp) = t
            .component
            .as_deref()
            .map(|c| c.trim())
            .filter(|c| !c.is_empty())
        {
            *stats.by_component.entry(comp.to_lowercase()).or_insert(0) += 1;
        } else {
            *stats
                .by_component
                .entry("unknown".to_string())
                .or_insert(0) += 1;
        }

        let mut blocked = false;
        for dep in &t.depends_on {
            if !all_ids.contains(dep.as_str()) {
                missing_deps.insert(dep.clone());
                continue;
            }
            if let Some(dep_status) = status_by_id.get(dep.as_str()) {
                if dep_status != "done" {
                    blocked = true;
                }
            }
        }
        if blocked && status != "done" {
            stats.blocked_by_deps += 1;
        }
    }

    stats.missing_deps = missing_deps.len();
    stats
}

fn fnv1a_64(bytes: &[u8]) -> u64 {
    const OFFSET_BASIS: u64 = 0xcbf29ce484222325;
    const PRIME: u64 = 0x100000001b3;
    let mut hash = OFFSET_BASIS;
    for b in bytes {
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}
