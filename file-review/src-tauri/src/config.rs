use serde::{Deserialize, Serialize};
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
    pub window: WindowConfig,
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
            window: WindowConfig {
                width: 1200,
                height: 800,
            },
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
