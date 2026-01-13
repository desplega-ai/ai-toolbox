use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub current_file: Mutex<Option<PathBuf>>,
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

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
