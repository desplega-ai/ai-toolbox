pub mod comments;
pub mod config;
pub mod file_ops;

#[cfg(feature = "web")]
pub mod web_server;

#[cfg(feature = "web")]
pub mod tunnel;

use comments::{
    format_comments_json, format_comments_readable, format_stdin_output_json,
    format_stdin_output_readable, parse_comments_for_output,
};
use file_ops::AppState;
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(
    file_paths: Vec<String>,
    silent: bool,
    json_output: bool,
    stdin_mode: bool,
    original_content: Option<String>,
) {
    let initial_files: Vec<std::path::PathBuf> =
        file_paths.iter().map(std::path::PathBuf::from).collect();
    let primary_file = initial_files.first().cloned();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(move |app| {
            // Seed AppState: current_file = first arg (single-file flows still
            // work); initial_files = all args (JS opens a tab per path).
            {
                let state: tauri::State<'_, AppState> = app.state();
                if let Some(ref path) = primary_file {
                    let mut current = state.current_file.lock().unwrap();
                    *current = Some(path.clone());
                }
                let mut initial = state.initial_files.lock().unwrap();
                *initial = initial_files.clone();
            }

            // Create menu with keyboard shortcuts
            let save_item = MenuItemBuilder::new("Save")
                .id("save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;

            // Cmd+W closes the active tab (not the window). The OS-level
            // accelerator emits `menu:close-tab` which JS handles. JS also
            // registers a window-level keydown for the same key — whichever
            // fires first calls `closeTab` and the other becomes a no-op.
            let close_tab_item = MenuItemBuilder::new("Close Tab")
                .id("close_tab")
                .accelerator("CmdOrCtrl+W")
                .build(app)?;

            let new_tab_item = MenuItemBuilder::new("New Tab…")
                .id("new_tab")
                .accelerator("CmdOrCtrl+T")
                .build(app)?;

            let quit_item = MenuItemBuilder::new("Quit")
                .id("quit")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_tab_item)
                .separator()
                .item(&save_item)
                .item(&close_tab_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let undo_item = PredefinedMenuItem::undo(app, None)?;
            let redo_item = PredefinedMenuItem::redo(app, None)?;
            let cut_item = PredefinedMenuItem::cut(app, None)?;
            let copy_item = PredefinedMenuItem::copy(app, None)?;
            let paste_item = PredefinedMenuItem::paste(app, None)?;
            let select_all_item = PredefinedMenuItem::select_all(app, None)?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&undo_item)
                .item(&redo_item)
                .separator()
                .item(&cut_item)
                .item(&copy_item)
                .item(&paste_item)
                .item(&select_all_item)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&edit_menu)
                .build()?;
            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app, event| {
                match event.id().as_ref() {
                    "save" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("menu:save", ());
                        }
                    }
                    "close_tab" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("menu:close-tab", ());
                        }
                    }
                    "new_tab" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("menu:new-tab", ());
                        }
                    }
                    "quit" => {
                        // Close the window instead of directly exiting
                        // This triggers CloseRequested event which outputs comments
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.close();
                        }
                    }
                    _ => {}
                }
            });

            // Load config and set window size
            let cfg = config::load_config();
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                    cfg.window.width as f64,
                    cfg.window.height as f64,
                )));

                // Save window size and output comments on close
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        if let Some(win) = app_handle.get_webview_window("main") {
                            // Save window size
                            if let Ok(size) = win.inner_size() {
                                let mut cfg = config::load_config();
                                cfg.window.width = size.width;
                                cfg.window.height = size.height;
                                let _ = config::save_config(cfg);
                            }

                            // Output comments if not silent
                            let state: tauri::State<'_, AppState> = app_handle.state();
                            if !state.silent {
                                if let Some(file_path) = state.current_file.lock().ok().and_then(|f| f.clone()) {
                                    if let Ok(content) = std::fs::read_to_string(&file_path) {
                                        let comments = parse_comments_for_output(&content);

                                        if state.stdin_mode {
                                            // In stdin mode, always output file + content + comments
                                            let file_path_str = file_path.to_string_lossy().to_string();
                                            let modified = state
                                                .original_content
                                                .lock()
                                                .ok()
                                                .and_then(|orig| {
                                                    orig.as_ref().map(|o| o != &content)
                                                })
                                                .unwrap_or(false);

                                            if state.json_output {
                                                println!(
                                                    "{}",
                                                    format_stdin_output_json(
                                                        &file_path_str,
                                                        &content,
                                                        &comments,
                                                        modified
                                                    )
                                                );
                                            } else {
                                                println!(
                                                    "{}",
                                                    format_stdin_output_readable(
                                                        &file_path_str,
                                                        &content,
                                                        &comments,
                                                        modified
                                                    )
                                                );
                                            }
                                        } else {
                                            // Normal file mode - only output comments
                                            if !comments.is_empty() {
                                                if state.json_output {
                                                    println!("{}", format_comments_json(&comments));
                                                } else {
                                                    println!("{}", format_comments_readable(&comments));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .manage(AppState {
            current_file: Mutex::new(None),
            initial_files: Mutex::new(Vec::new()),
            silent,
            json_output,
            stdin_mode,
            original_content: Mutex::new(original_content),
        })
        .invoke_handler(tauri::generate_handler![
            file_ops::read_file,
            file_ops::write_file,
            file_ops::set_current_file,
            file_ops::get_current_file,
            file_ops::get_initial_files,
            file_ops::reveal_in_finder,
            file_ops::is_stdin_mode,
            file_ops::get_version,
            comments::parse_comments,
            comments::insert_wrapped_comment,
            comments::insert_nextline_comment,
            comments::remove_comment,
            config::load_config,
            config::save_config,
            config::get_config_path_string,
            config::open_config_in_editor,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
