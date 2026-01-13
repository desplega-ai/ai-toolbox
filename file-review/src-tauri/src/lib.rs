mod comments;
mod config;
mod file_ops;

use file_ops::AppState;
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Get command line arguments
            let args: Vec<String> = std::env::args().collect();
            let file_path = args.get(1).cloned();

            // Store file path for frontend to retrieve
            if let Some(path) = file_path {
                let state: tauri::State<'_, AppState> = app.state();
                let mut current = state.current_file.lock().unwrap();
                *current = Some(std::path::PathBuf::from(path));
            }

            // Create menu with keyboard shortcuts
            let save_item = MenuItemBuilder::new("Save")
                .id("save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;

            let quit_item = MenuItemBuilder::new("Quit")
                .id("quit")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&save_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let menu = MenuBuilder::new(app).item(&file_menu).build()?;
            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app, event| {
                match event.id().as_ref() {
                    "save" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("menu:save", ());
                        }
                    }
                    "quit" => {
                        app.exit(0);
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

                // Save window size on close
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        if let Some(win) = app_handle.get_webview_window("main") {
                            if let Ok(size) = win.inner_size() {
                                let mut cfg = config::load_config();
                                cfg.window.width = size.width;
                                cfg.window.height = size.height;
                                let _ = config::save_config(cfg);
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .manage(AppState {
            current_file: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            file_ops::read_file,
            file_ops::write_file,
            file_ops::set_current_file,
            file_ops::get_current_file,
            file_ops::reveal_in_finder,
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
