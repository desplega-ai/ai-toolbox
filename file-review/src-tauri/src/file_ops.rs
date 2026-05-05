use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub current_file: Mutex<Option<PathBuf>>,
    /// All file paths supplied on the CLI (in order). Used by JS at startup
    /// to open one tab per path. `current_file` mirrors the first path so the
    /// existing single-file close-export flow keeps working until step-3
    /// promotes it to multi-file. Empty if no file args were passed.
    pub initial_files: Mutex<Vec<PathBuf>>,
    pub silent: bool,
    pub json_output: bool,
    pub stdin_mode: bool,
    pub original_content: Mutex<Option<String>>,
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_current_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut current = state.current_file.lock().map_err(|e| e.to_string())?;
    *current = Some(PathBuf::from(path));
    Ok(())
}

#[tauri::command]
pub fn get_current_file(state: State<'_, AppState>) -> Option<String> {
    let current = state.current_file.lock().ok()?;
    current.as_ref().map(|p| p.to_string_lossy().to_string())
}

/// Return all file paths that were passed on the CLI. JS calls this at
/// startup to open one tab per path. Empty if no file args.
#[tauri::command]
pub fn get_initial_files(state: State<'_, AppState>) -> Vec<String> {
    state
        .initial_files
        .lock()
        .ok()
        .map(|v| v.iter().map(|p| p.to_string_lossy().to_string()).collect())
        .unwrap_or_default()
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = std::path::Path::new(&path).parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn is_stdin_mode(state: State<'_, AppState>) -> bool {
    state.stdin_mode
}

#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
