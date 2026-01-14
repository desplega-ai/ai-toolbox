use regex::Regex;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewComment {
    pub id: String,
    pub text: String,
    pub comment_type: String, // "inline" or "line"
    // Position of the start marker (character offset for frontend compatibility)
    pub marker_pos: usize,
    // Position of the highlighted content (character offsets for frontend compatibility)
    pub highlight_start: usize,
    pub highlight_end: usize,
}

/// Comment structure for CLI output (with line numbers and content)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputComment {
    pub id: String,
    pub comment: String,
    #[serde(rename = "type")]
    pub comment_type: String,
    pub start_line: usize,
    pub end_line: usize,
    pub content: String,
}

/// Calculate line number from byte position
fn byte_pos_to_line(content: &str, byte_pos: usize) -> usize {
    content[..byte_pos.min(content.len())]
        .chars()
        .filter(|&c| c == '\n')
        .count()
        + 1
}

/// Convert UTF-16 code unit offset (from JavaScript/CodeMirror) to byte offset
/// JavaScript strings and CodeMirror positions use UTF-16 code units, where
/// characters outside BMP (like emoji) count as 2 units (surrogate pairs)
fn char_offset_to_byte_offset(content: &str, utf16_pos: usize) -> Option<usize> {
    let mut utf16_count = 0;
    for (byte_idx, ch) in content.char_indices() {
        if utf16_count == utf16_pos {
            return Some(byte_idx);
        }
        // Characters outside BMP need 2 UTF-16 code units (surrogate pair)
        utf16_count += ch.len_utf16();
    }
    // Handle position at end of string
    if utf16_count == utf16_pos {
        Some(content.len())
    } else {
        None
    }
}

/// Convert byte offset to UTF-16 code unit offset (for JavaScript/CodeMirror)
fn byte_offset_to_char_offset(content: &str, byte_pos: usize) -> usize {
    content[..byte_pos.min(content.len())]
        .chars()
        .map(|ch| ch.len_utf16())
        .sum()
}

/// Parse comments and return OutputComment structs with line numbers
/// Uses byte positions internally for accurate string slicing
pub fn parse_comments_for_output(content: &str) -> Vec<OutputComment> {
    let mut comments = Vec::new();

    // Parse inline wrapped comments
    let inline_start_re = Regex::new(r"<!--\s*review-start\(([a-zA-Z0-9-]+)\)\s*-->").unwrap();
    let inline_end_template = r"<!--\s*review-end\(ID\):\s*([\s\S]*?)\s*-->";

    for start_cap in inline_start_re.captures_iter(content) {
        let id = start_cap.get(1).map_or("", |m| m.as_str()).to_string();
        let start_match = start_cap.get(0).unwrap();
        let byte_content_start = start_match.end();

        let end_pattern = inline_end_template.replace("ID", &regex::escape(&id));
        let end_re = Regex::new(&end_pattern).unwrap();

        if let Some(end_cap) = end_re.captures(&content[byte_content_start..]) {
            let comment_text = end_cap.get(1).map_or("", |m| m.as_str()).to_string();
            let end_match = end_cap.get(0).unwrap();
            let byte_content_end = byte_content_start + end_match.start();

            let start_line = byte_pos_to_line(content, byte_content_start);
            let end_line = byte_pos_to_line(content, byte_content_end);
            let highlighted_content = content
                .get(byte_content_start..byte_content_end)
                .unwrap_or("")
                .to_string();

            comments.push(OutputComment {
                id,
                comment: comment_text,
                comment_type: "inline".to_string(),
                start_line,
                end_line,
                content: highlighted_content,
            });
        }
    }

    // Parse line comments
    let line_start_re = Regex::new(r"<!--\s*review-line-start\(([a-zA-Z0-9-]+)\)\s*-->\n?").unwrap();
    let line_end_template = r"<!--\s*review-line-end\(ID\):\s*([\s\S]*?)\s*-->";

    for start_cap in line_start_re.captures_iter(content) {
        let id = start_cap.get(1).map_or("", |m| m.as_str()).to_string();
        let start_match = start_cap.get(0).unwrap();
        let byte_content_start = start_match.end();

        let end_pattern = line_end_template.replace("ID", &regex::escape(&id));
        let end_re = Regex::new(&end_pattern).unwrap();

        if let Some(end_cap) = end_re.captures(&content[byte_content_start..]) {
            let comment_text = end_cap.get(1).map_or("", |m| m.as_str()).to_string();
            let end_match = end_cap.get(0).unwrap();
            let mut byte_content_end = byte_content_start + end_match.start();

            if byte_content_end > byte_content_start
                && content.as_bytes().get(byte_content_end - 1) == Some(&b'\n')
            {
                byte_content_end -= 1;
            }

            let start_line = byte_pos_to_line(content, byte_content_start);
            let end_line = byte_pos_to_line(content, byte_content_end);
            let highlighted_content = content
                .get(byte_content_start..byte_content_end)
                .unwrap_or("")
                .to_string();

            comments.push(OutputComment {
                id,
                comment: comment_text,
                comment_type: "line".to_string(),
                start_line,
                end_line,
                content: highlighted_content,
            });
        }
    }

    comments
}

/// Format comments as human-readable string
pub fn format_comments_readable(comments: &[OutputComment]) -> String {
    if comments.is_empty() {
        return String::from("No review comments found.");
    }

    let mut output = format!("=== Review Comments ({}) ===\n", comments.len());

    for c in comments {
        let line_info = if c.start_line == c.end_line {
            format!("Line {}", c.start_line)
        } else {
            format!("Lines {}-{}", c.start_line, c.end_line)
        };

        output.push_str(&format!("\n[{}] {} ({}):\n", c.id, line_info, c.comment_type));

        // Indent the content, handling multi-line
        if c.content.is_empty() {
            output.push_str("    (empty selection)\n");
        } else {
            for line in c.content.lines() {
                output.push_str(&format!("    \"{}\"\n", line));
            }
        }
        output.push_str(&format!("    → {}\n", c.comment));
    }

    output
}

/// Format comments as JSON string
pub fn format_comments_json(comments: &[OutputComment]) -> String {
    serde_json::to_string_pretty(comments).unwrap_or_else(|_| "[]".to_string())
}

/// Combined output for stdin mode (file path + content + comments)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StdinOutput {
    pub file: String,
    pub content: String,
    pub comments: Vec<OutputComment>,
    pub modified: bool,
}

/// Format stdin output as JSON string
pub fn format_stdin_output_json(
    file: &str,
    content: &str,
    comments: &[OutputComment],
    modified: bool,
) -> String {
    let output = StdinOutput {
        file: file.to_string(),
        content: content.to_string(),
        comments: comments.to_vec(),
        modified,
    };
    serde_json::to_string_pretty(&output).unwrap_or_else(|_| "{}".to_string())
}

/// Format stdin output as human-readable string
pub fn format_stdin_output_readable(
    file: &str,
    content: &str,
    comments: &[OutputComment],
    modified: bool,
) -> String {
    let mut output = String::new();

    // File section
    output.push_str("=== File ===\n");
    output.push_str(file);
    output.push('\n');

    // Content section
    output.push_str("\n=== Content ===\n");
    output.push_str(content);
    if !content.ends_with('\n') {
        output.push('\n');
    }

    // Comments section
    output.push_str("\n=== Review Comments");
    if modified {
        output.push_str(" (content modified)");
    }
    output.push_str(" ===\n");

    if comments.is_empty() {
        output.push_str("No review comments.\n");
    } else {
        for c in comments {
            let line_info = if c.start_line == c.end_line {
                format!("Line {}", c.start_line)
            } else {
                format!("Lines {}-{}", c.start_line, c.end_line)
            };

            output.push_str(&format!("\n[{}] {} ({}):\n", c.id, line_info, c.comment_type));

            if c.content.is_empty() {
                output.push_str("    (empty selection)\n");
            } else {
                for line in c.content.lines() {
                    output.push_str(&format!("    \"{}\"\n", line));
                }
            }
            output.push_str(&format!("    → {}\n", c.comment));
        }
    }

    output
}

/// Internal parsing logic for Tauri command - returns character positions for frontend
fn parse_comments_internal(content: &str) -> Vec<ReviewComment> {
    let mut comments = Vec::new();

    // Parse inline wrapped comments: <!-- review-start(id) -->...<!-- review-end(id): text -->
    let inline_start_re = Regex::new(r"<!--\s*review-start\(([a-zA-Z0-9-]+)\)\s*-->").unwrap();
    let inline_end_template = r"<!--\s*review-end\(ID\):\s*([\s\S]*?)\s*-->";

    for start_cap in inline_start_re.captures_iter(content) {
        let id = start_cap.get(1).map_or("", |m| m.as_str()).to_string();
        let start_match = start_cap.get(0).unwrap();
        let byte_marker_pos = start_match.start();
        let byte_content_start = start_match.end();

        // Find matching end marker
        let end_pattern = inline_end_template.replace("ID", &regex::escape(&id));
        let end_re = Regex::new(&end_pattern).unwrap();

        if let Some(end_cap) = end_re.captures(&content[byte_content_start..]) {
            let comment_text = end_cap.get(1).map_or("", |m| m.as_str()).to_string();
            let end_match = end_cap.get(0).unwrap();
            let byte_content_end = byte_content_start + end_match.start();

            // Convert byte positions to character positions for frontend compatibility
            let char_marker_pos = byte_offset_to_char_offset(content, byte_marker_pos);
            let char_content_start = byte_offset_to_char_offset(content, byte_content_start);
            let char_content_end = byte_offset_to_char_offset(content, byte_content_end);

            comments.push(ReviewComment {
                id,
                text: comment_text,
                comment_type: "inline".to_string(),
                marker_pos: char_marker_pos,
                highlight_start: char_content_start,
                highlight_end: char_content_end,
            });
        }
    }

    // Parse line comments: <!-- review-line-start(id) -->\n...\n<!-- review-line-end(id): text -->
    let line_start_re = Regex::new(r"<!--\s*review-line-start\(([a-zA-Z0-9-]+)\)\s*-->\n?").unwrap();
    let line_end_template = r"<!--\s*review-line-end\(ID\):\s*([\s\S]*?)\s*-->";

    for start_cap in line_start_re.captures_iter(content) {
        let id = start_cap.get(1).map_or("", |m| m.as_str()).to_string();
        let start_match = start_cap.get(0).unwrap();
        let byte_marker_pos = start_match.start();
        let byte_content_start = start_match.end();

        // Find matching end marker
        let end_pattern = line_end_template.replace("ID", &regex::escape(&id));
        let end_re = Regex::new(&end_pattern).unwrap();

        if let Some(end_cap) = end_re.captures(&content[byte_content_start..]) {
            let comment_text = end_cap.get(1).map_or("", |m| m.as_str()).to_string();
            let end_match = end_cap.get(0).unwrap();
            let mut byte_content_end = byte_content_start + end_match.start();

            // Trim trailing newline from highlighted content
            if byte_content_end > byte_content_start && content.as_bytes().get(byte_content_end - 1) == Some(&b'\n') {
                byte_content_end -= 1;
            }

            // Convert byte positions to character positions for frontend compatibility
            let char_marker_pos = byte_offset_to_char_offset(content, byte_marker_pos);
            let char_content_start = byte_offset_to_char_offset(content, byte_content_start);
            let char_content_end = byte_offset_to_char_offset(content, byte_content_end);

            comments.push(ReviewComment {
                id,
                text: comment_text,
                comment_type: "line".to_string(),
                marker_pos: char_marker_pos,
                highlight_start: char_content_start,
                highlight_end: char_content_end,
            });
        }
    }

    comments
}

#[tauri::command]
pub fn parse_comments(content: String) -> Vec<ReviewComment> {
    parse_comments_internal(&content)
}

#[tauri::command]
pub fn insert_wrapped_comment(
    content: String,
    start_pos: usize,  // Character offset from frontend
    end_pos: usize,    // Character offset from frontend
    text: String,
) -> (String, String) {
    let id = Uuid::new_v4().to_string()[..8].to_string();
    let start_marker = format!("<!-- review-start({}) -->", id);
    let end_marker = format!("<!-- review-end({}): {} -->", id, text);

    // Convert character offsets to byte offsets for string slicing
    let byte_start = char_offset_to_byte_offset(&content, start_pos)
        .unwrap_or(content.len());
    let byte_end = char_offset_to_byte_offset(&content, end_pos)
        .unwrap_or(content.len());

    let mut result = String::new();
    result.push_str(&content[..byte_start]);
    result.push_str(&start_marker);
    result.push_str(&content[byte_start..byte_end]);
    result.push_str(&end_marker);
    result.push_str(&content[byte_end..]);

    (result, id)
}

#[tauri::command]
pub fn insert_nextline_comment(
    content: String,
    line_start_pos: usize,  // Character offset from frontend
    line_end_pos: usize,    // Character offset from frontend
    text: String,
) -> (String, String) {
    let id = Uuid::new_v4().to_string()[..8].to_string();
    let start_marker = format!("<!-- review-line-start({}) -->\n", id);
    let end_marker = format!("\n<!-- review-line-end({}): {} -->", id, text);

    // Convert character offsets to byte offsets for string slicing
    let byte_start = char_offset_to_byte_offset(&content, line_start_pos)
        .unwrap_or(content.len());
    let byte_end = char_offset_to_byte_offset(&content, line_end_pos)
        .unwrap_or(content.len());

    let mut result = String::new();
    result.push_str(&content[..byte_start]);
    result.push_str(&start_marker);
    result.push_str(&content[byte_start..byte_end]);
    result.push_str(&end_marker);
    result.push_str(&content[byte_end..]);

    (result, id)
}

#[tauri::command]
pub fn remove_comment(content: String, comment_id: String) -> String {
    let escaped_id = regex::escape(&comment_id);

    // Remove inline wrapped comments (start and end markers)
    let inline_start_pattern = format!(r"<!--\s*review-start\({}\)\s*-->", escaped_id);
    let inline_end_pattern = format!(r"<!--\s*review-end\({}\):\s*[\s\S]*?\s*-->", escaped_id);

    let inline_start_re = Regex::new(&inline_start_pattern).unwrap();
    let inline_end_re = Regex::new(&inline_end_pattern).unwrap();

    let result = inline_start_re.replace_all(&content, "");
    let result = inline_end_re.replace_all(&result, "");

    // Remove line comments (start marker with newline and end marker with preceding newline)
    let line_start_pattern = format!(r"<!--\s*review-line-start\({}\)\s*-->\n?", escaped_id);
    let line_end_pattern = format!(r"\n?<!--\s*review-line-end\({}\):\s*[\s\S]*?\s*-->", escaped_id);

    let line_start_re = Regex::new(&line_start_pattern).unwrap();
    let line_end_re = Regex::new(&line_end_pattern).unwrap();

    let result = line_start_re.replace_all(&result, "");
    let result = line_end_re.replace_all(&result, "");

    result.to_string()
}
