use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowConfig {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub vim_mode: bool,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default)]
    pub markdown_raw: bool,
    #[serde(default)]
    pub save_on_quit: bool,
    pub window: WindowConfig,
    #[serde(default, deserialize_with = "deserialize_layout")]
    pub layout: LayoutConfig,
}

/// Rail and reading-width state. Mirrors `LayoutConfig` in src/config.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LayoutConfig {
    pub left_open: bool,
    pub left_width: u32,
    pub right_open: bool,
    pub right_width: u32,
    /// "narrow" or "full".
    pub reading_width: String,
}

impl Default for LayoutConfig {
    fn default() -> Self {
        Self {
            left_open: true,
            left_width: 240,
            right_open: true,
            right_width: 340,
            reading_width: "narrow".to_string(),
        }
    }
}

impl LayoutConfig {
    /// Read each field on its own so one bad value falls back to its default
    /// without resetting the rest of the layout (or the whole config).
    fn from_value(value: &Value) -> Self {
        let defaults = Self::default();
        let flag = |key: &str, fallback: bool| value.get(key).and_then(Value::as_bool).unwrap_or(fallback);
        let width = |key: &str, min: u64, max: u64, fallback: u32| {
            value
                .get(key)
                .and_then(Value::as_u64)
                .map(|n| n.clamp(min, max) as u32)
                .unwrap_or(fallback)
        };
        let reading_width = match value.get("reading_width").and_then(Value::as_str) {
            Some("full") => "full",
            _ => "narrow",
        };
        Self {
            left_open: flag("left_open", defaults.left_open),
            left_width: width("left_width", 180, 440, defaults.left_width),
            right_open: flag("right_open", defaults.right_open),
            right_width: width("right_width", 260, 560, defaults.right_width),
            reading_width: reading_width.to_string(),
        }
    }
}

fn deserialize_layout<'de, D>(deserializer: D) -> Result<LayoutConfig, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    Ok(LayoutConfig::from_value(&value))
}

fn default_font_size() -> u32 {
    14
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            vim_mode: false,
            font_size: 14,
            markdown_raw: false,
            save_on_quit: false,
            window: WindowConfig {
                width: 1200,
                height: 800,
            },
            layout: LayoutConfig::default(),
        }
    }
}

pub fn get_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".file-reviewer.json")
}

#[tauri::command]
pub fn load_config() -> AppConfig {
    let path = get_config_path();
    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => AppConfig::default(),
        }
    } else {
        AppConfig::default()
    }
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    let path = get_config_path();
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_config_path_string() -> String {
    get_config_path().to_string_lossy().to_string()
}

#[tauri::command]
pub fn open_config_in_editor() -> Result<(), String> {
    let path = get_config_path();

    // Ensure config file exists with defaults
    if !path.exists() {
        save_config(AppConfig::default())?;
    }

    // Launch new instance of file-review with config path
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    std::process::Command::new(exe_path)
        .arg(path.to_string_lossy().to_string())
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = r#""theme": "dark", "vim_mode": false, "window": { "width": 1200, "height": 800 }"#;

    #[test]
    fn old_config_without_layout_uses_defaults() {
        let cfg: AppConfig = serde_json::from_str(&format!("{{ {BASE} }}")).unwrap();
        assert_eq!(cfg.layout, LayoutConfig::default());
    }

    #[test]
    fn bad_layout_values_fall_back_per_field() {
        let json = format!(
            r#"{{ {BASE}, "layout": {{ "left_open": false, "left_width": 9999, "right_open": "yes", "right_width": -5, "reading_width": "wide" }} }}"#
        );
        let cfg: AppConfig = serde_json::from_str(&json).unwrap();
        assert!(!cfg.layout.left_open);
        assert_eq!(cfg.layout.left_width, 440);
        assert!(cfg.layout.right_open);
        assert_eq!(cfg.layout.right_width, 340);
        assert_eq!(cfg.layout.reading_width, "narrow");
    }

    #[test]
    fn non_object_layout_falls_back() {
        let cfg: AppConfig = serde_json::from_str(&format!(r#"{{ {BASE}, "layout": 42 }}"#)).unwrap();
        assert_eq!(cfg.layout, LayoutConfig::default());
    }
}
