use regex::Regex;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewComment {
    pub id: String,
    pub text: String,
    pub comment_type: String, // "inline" or "line"
    // Position of the start marker
    pub marker_pos: usize,
    // Position of the highlighted content (absolute char positions in document)
    pub highlight_start: usize,
    pub highlight_end: usize,
}

#[tauri::command]
pub fn parse_comments(content: String) -> Vec<ReviewComment> {
    let mut comments = Vec::new();

    // Parse inline wrapped comments: <!-- review-start(id) -->...<!-- review-end(id): text -->
    let inline_start_re = Regex::new(r"<!--\s*review-start\(([a-zA-Z0-9-]+)\)\s*-->").unwrap();
    let inline_end_template = r"<!--\s*review-end\(ID\):\s*([\s\S]*?)\s*-->";

    for start_cap in inline_start_re.captures_iter(&content) {
        let id = start_cap.get(1).map_or("", |m| m.as_str()).to_string();
        let start_match = start_cap.get(0).unwrap();
        let start_marker_pos = start_match.start();
        let content_start = start_match.end();

        // Find matching end marker
        let end_pattern = inline_end_template.replace("ID", &regex::escape(&id));
        let end_re = Regex::new(&end_pattern).unwrap();

        if let Some(end_cap) = end_re.captures(&content[content_start..]) {
            let comment_text = end_cap.get(1).map_or("", |m| m.as_str()).to_string();
            let end_match = end_cap.get(0).unwrap();
            let content_end = content_start + end_match.start();

            comments.push(ReviewComment {
                id,
                text: comment_text,
                comment_type: "inline".to_string(),
                marker_pos: start_marker_pos,
                highlight_start: content_start,
                highlight_end: content_end,
            });
        }
    }

    // Parse line comments: <!-- review-line-start(id) -->\n...\n<!-- review-line-end(id): text -->
    let line_start_re = Regex::new(r"<!--\s*review-line-start\(([a-zA-Z0-9-]+)\)\s*-->\n?").unwrap();
    let line_end_template = r"<!--\s*review-line-end\(ID\):\s*([\s\S]*?)\s*-->";

    for start_cap in line_start_re.captures_iter(&content) {
        let id = start_cap.get(1).map_or("", |m| m.as_str()).to_string();
        let start_match = start_cap.get(0).unwrap();
        let start_marker_pos = start_match.start();
        let content_start = start_match.end();

        // Find matching end marker
        let end_pattern = line_end_template.replace("ID", &regex::escape(&id));
        let end_re = Regex::new(&end_pattern).unwrap();

        if let Some(end_cap) = end_re.captures(&content[content_start..]) {
            let comment_text = end_cap.get(1).map_or("", |m| m.as_str()).to_string();
            let end_match = end_cap.get(0).unwrap();
            let mut content_end = content_start + end_match.start();

            // Trim trailing newline from highlighted content
            if content_end > content_start && content.as_bytes().get(content_end - 1) == Some(&b'\n') {
                content_end -= 1;
            }

            comments.push(ReviewComment {
                id,
                text: comment_text,
                comment_type: "line".to_string(),
                marker_pos: start_marker_pos,
                highlight_start: content_start,
                highlight_end: content_end,
            });
        }
    }

    comments
}

#[tauri::command]
pub fn insert_wrapped_comment(
    content: String,
    start_pos: usize,
    end_pos: usize,
    text: String,
) -> (String, String) {
    let id = Uuid::new_v4().to_string()[..8].to_string();
    let start_marker = format!("<!-- review-start({}) -->", id);
    let end_marker = format!("<!-- review-end({}): {} -->", id, text);

    let mut result = String::new();
    result.push_str(&content[..start_pos]);
    result.push_str(&start_marker);
    result.push_str(&content[start_pos..end_pos]);
    result.push_str(&end_marker);
    result.push_str(&content[end_pos..]);

    (result, id)
}

#[tauri::command]
pub fn insert_nextline_comment(
    content: String,
    line_start_pos: usize,
    line_end_pos: usize,
    text: String,
) -> (String, String) {
    let id = Uuid::new_v4().to_string()[..8].to_string();
    let start_marker = format!("<!-- review-line-start({}) -->\n", id);
    let end_marker = format!("\n<!-- review-line-end({}): {} -->", id, text);

    let mut result = String::new();
    result.push_str(&content[..line_start_pos]);
    result.push_str(&start_marker);
    result.push_str(&content[line_start_pos..line_end_pos]);
    result.push_str(&end_marker);
    result.push_str(&content[line_end_pos..]);

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
