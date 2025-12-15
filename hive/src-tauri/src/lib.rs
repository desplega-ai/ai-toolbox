use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, State};

// PTY session data
struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
}

// Application state holding all PTY sessions
struct AppState {
    sessions: Mutex<HashMap<String, PtySession>>,
}

#[derive(Clone, Serialize)]
struct PtyOutput {
    session_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct PtyExit {
    session_id: String,
    code: Option<i32>,
}

#[derive(Deserialize)]
pub struct CreatePtyRequest {
    session_id: String,
    cwd: String,
    rows: u16,
    cols: u16,
    resume_session: Option<String>,
}

#[tauri::command]
async fn create_pty_session(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    request: CreatePtyRequest,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: request.rows,
            cols: request.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Build the claude command with proper environment
    let mut cmd = CommandBuilder::new("claude");

    // Add resume flag if provided
    if let Some(ref resume_id) = request.resume_session {
        cmd.arg("--resume");
        cmd.arg(resume_id);
    }

    // Inherit current environment
    for (key, value) in std::env::vars() {
        cmd.env(key, value);
    }

    // Override terminal-specific settings
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "hive");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");

    cmd.cwd(&request.cwd);

    // Spawn the command in the PTY
    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    // Get writer for sending input
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Get reader for receiving output
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let session_id = request.session_id.clone();

    // Store the session
    {
        let mut sessions = state.sessions.lock();
        sessions.insert(
            session_id.clone(),
            PtySession {
                writer,
                master: pair.master,
            },
        );
    }

    // Spawn thread to read PTY output and emit events
    let app_handle = app.clone();
    let sid = session_id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 16384]; // Larger buffer to avoid splitting escape sequences
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_handle.emit(
                        "pty-output",
                        PtyOutput {
                            session_id: sid.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });

    // Spawn thread to wait for process exit
    let app_handle = app.clone();
    let sid = session_id.clone();
    thread::spawn(move || {
        let status = child.wait();
        let code = status.ok().map(|s| s.exit_code() as i32);
        let _ = app_handle.emit(
            "pty-exit",
            PtyExit {
                session_id: sid,
                code,
            },
        );
    });

    Ok(())
}

#[tauri::command]
async fn write_to_pty(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock();
    if let Some(session) = sessions.get_mut(&session_id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Session {} not found", session_id))
    }
}

#[tauri::command]
async fn resize_pty(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock();
    if let Some(session) = sessions.get(&session_id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Session {} not found", session_id))
    }
}

#[tauri::command]
async fn close_pty_session(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock();
    sessions.remove(&session_id);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(AppState {
        sessions: Mutex::new(HashMap::new()),
    });

    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            create_pty_session,
            write_to_pty,
            resize_pty,
            close_pty_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
