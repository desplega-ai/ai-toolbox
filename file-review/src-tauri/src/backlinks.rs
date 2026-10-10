//! Backlinks: markdown files that link to a given file.
//!
//! The search root is the nearest ancestor holding `.git`, else the file's
//! directory. Only `*.md` and `*.markdown` files are read.

use regex::Regex;
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

const MAX_FILES: usize = 3000;
const MAX_FILE_BYTES: u64 = 1024 * 1024;
const MAX_RESULTS: usize = 200;
const SKIP_DIRS: &[&str] = &[".git", "node_modules", "target", "dist"];

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Backlink {
    pub path: String,
    /// 1-based line of the link.
    pub line: usize,
    /// Link text (alt text for images).
    pub text: String,
}

/// `[text](target "title")` and `![alt](target)`; the target may be `<...>`.
fn inline_link_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"!?\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)"#)
            .unwrap()
    })
}

/// Reference definition `[id]: target`.
fn ref_def_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^ {0,3}\[([^\]]+)\]:\s*(?:<([^>]*)>|(\S+))").unwrap())
}

fn scheme_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^[a-zA-Z][a-zA-Z0-9+.-]*:").unwrap())
}

/// Collapse `.` and `..` without touching the filesystem.
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Decode `%XX` escapes; invalid escapes stay as they are.
pub fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(byte) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Absolute path a link `target` in `from_file` points at. None for URLs,
/// in-page anchors and empty targets. `#fragment` and `?query` are dropped.
pub fn resolve_link_target(from_file: &Path, target: &str) -> Option<PathBuf> {
    let target = target.trim();
    let target = &target[..target.find(['#', '?']).unwrap_or(target.len())];
    if target.is_empty() || target.starts_with("//") || scheme_regex().is_match(target) {
        return None;
    }
    let decoded = percent_decode(target);
    let path = Path::new(&decoded);
    let joined = if path.is_absolute() {
        path.to_path_buf()
    } else {
        from_file.parent()?.join(path)
    };
    Some(normalize(&joined))
}

/// (text, target) of every link, image and reference definition on a line.
fn line_links(line: &str) -> Vec<(String, String)> {
    let target_of = |caps: &regex::Captures| {
        caps.get(2)
            .or_else(|| caps.get(3))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default()
    };
    let mut links: Vec<(String, String)> = inline_link_regex()
        .captures_iter(line)
        .map(|caps| (caps[1].to_string(), target_of(&caps)))
        .collect();
    if let Some(caps) = ref_def_regex().captures(line) {
        // `[^id]: text` is a footnote, not a link.
        if !caps[1].starts_with('^') {
            links.push((caps[1].to_string(), target_of(&caps)));
        }
    }
    links
}

/// Nearest ancestor of the file's directory that holds `.git`, else that directory.
pub fn search_root(file: &Path) -> PathBuf {
    let dir = file.parent().unwrap_or(Path::new("/"));
    dir.ancestors()
        .find(|d| d.join(".git").exists())
        .unwrap_or(dir)
        .to_path_buf()
}

fn is_markdown(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// Markdown files under `root`, skipping hidden and build directories.
/// Symlinked directories are not followed.
fn markdown_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                if !name.starts_with('.') && !SKIP_DIRS.contains(&name.as_str()) {
                    stack.push(entry.path());
                }
            } else if file_type.is_file() && is_markdown(&name) {
                let too_big = entry.metadata().map(|m| m.len() > MAX_FILE_BYTES).unwrap_or(true);
                if too_big {
                    continue;
                }
                files.push(entry.path());
                if files.len() >= MAX_FILES {
                    return files;
                }
            }
        }
    }
    files
}

fn points_to(resolved: &Path, target: &Path, canonical: Option<&Path>) -> bool {
    if resolved == target {
        return true;
    }
    // Same file through a symlink or a different spelling of the path.
    resolved.file_name() == target.file_name()
        && canonical.is_some()
        && fs::canonicalize(resolved).ok().as_deref() == canonical
}

/// Links in `content` (the markdown of `file`) that point at `target`.
fn scan(file: &Path, content: &str, target: &Path, canonical: Option<&Path>, out: &mut Vec<Backlink>) {
    let mut in_fence = false;
    for (idx, line) in content.lines().enumerate() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        for (text, dest) in line_links(line) {
            let Some(resolved) = resolve_link_target(file, &dest) else {
                continue;
            };
            if points_to(&resolved, target, canonical) {
                out.push(Backlink {
                    path: file.to_string_lossy().to_string(),
                    line: idx + 1,
                    text,
                });
            }
        }
    }
}

/// Markdown files that link to `path`, sorted by path then line, capped at 200.
pub fn find_backlinks(path: &str) -> Vec<Backlink> {
    let given = Path::new(path);
    let target = if given.is_absolute() {
        normalize(given)
    } else {
        match std::env::current_dir() {
            Ok(cwd) => normalize(&cwd.join(given)),
            Err(_) => return Vec::new(),
        }
    };
    let canonical = fs::canonicalize(&target).ok();

    let mut out = Vec::new();
    for file in markdown_files(&search_root(&target)) {
        if file == target {
            continue;
        }
        let Ok(content) = fs::read_to_string(&file) else {
            continue;
        };
        scan(&file, &content, &target, canonical.as_deref(), &mut out);
    }
    out.sort_by(|a, b| a.path.cmp(&b.path).then(a.line.cmp(&b.line)));
    out.truncate(MAX_RESULTS);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_relative_targets_and_drops_fragments() {
        let from = Path::new("/repo/docs/guide/intro.md");
        assert_eq!(
            resolve_link_target(from, "./next.md#setup"),
            Some(PathBuf::from("/repo/docs/guide/next.md"))
        );
        assert_eq!(
            resolve_link_target(from, "../api/ref.md?raw=1"),
            Some(PathBuf::from("/repo/docs/api/ref.md"))
        );
        assert_eq!(
            resolve_link_target(from, "/abs/My%20Notes.md"),
            Some(PathBuf::from("/abs/My Notes.md"))
        );
        assert_eq!(
            resolve_link_target(from, "caf%C3%A9.md"),
            Some(PathBuf::from("/repo/docs/guide/café.md"))
        );
    }

    #[test]
    fn ignores_urls_anchors_and_empty_targets() {
        let from = Path::new("/repo/a.md");
        assert_eq!(resolve_link_target(from, "https://example.com/a.md"), None);
        assert_eq!(resolve_link_target(from, "mailto:me@x.dev"), None);
        assert_eq!(resolve_link_target(from, "//cdn.x.dev/a.md"), None);
        assert_eq!(resolve_link_target(from, "#heading"), None);
        assert_eq!(resolve_link_target(from, ""), None);
    }

    #[test]
    fn percent_decode_keeps_invalid_escapes() {
        assert_eq!(percent_decode("a%20b"), "a b");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz%4"), "%zz%4");
    }

    #[test]
    fn finds_links_images_and_reference_definitions() {
        let links = line_links(r#"See [the guide](./guide.md "Title") and ![chart](<img/a b.png>)."#);
        assert_eq!(
            links,
            vec![
                ("the guide".to_string(), "./guide.md".to_string()),
                ("chart".to_string(), "img/a b.png".to_string()),
            ]
        );
        assert_eq!(
            line_links("[ref]: ../other.md"),
            vec![("ref".to_string(), "../other.md".to_string())]
        );
        assert!(line_links("[^1]: a footnote").is_empty());
    }

    #[test]
    fn finds_backlinks_in_a_folder() {
        let root = std::env::temp_dir().join(format!("file-review-backlinks-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::create_dir_all(root.join("docs/sub")).unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("docs/target.md"), "# Target\n").unwrap();
        fs::write(
            root.join("docs/sub/b.md"),
            "intro\n[back](../target.md#top)\n```\n[code](../target.md)\n```\n",
        )
        .unwrap();
        fs::write(root.join("a.md"), "![img](docs/target.md) [other](docs/x.md)\n").unwrap();
        fs::write(root.join("node_modules/pkg/c.md"), "[skip](../../docs/target.md)\n").unwrap();

        let target = root.join("docs/target.md");
        let found = find_backlinks(&target.to_string_lossy());
        let summary: Vec<(String, usize, String)> = found
            .iter()
            .map(|b| {
                let rel = Path::new(&b.path).strip_prefix(&root).unwrap().to_string_lossy().to_string();
                (rel, b.line, b.text.clone())
            })
            .collect();
        assert_eq!(
            summary,
            vec![
                ("a.md".to_string(), 1, "img".to_string()),
                ("docs/sub/b.md".to_string(), 2, "back".to_string()),
            ]
        );
        let _ = fs::remove_dir_all(&root);
    }
}
