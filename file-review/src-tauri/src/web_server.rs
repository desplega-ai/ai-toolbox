//! Web server mode for file-review
//!
//! This module provides an HTTP server that serves the frontend and exposes
//! REST API endpoints equivalent to the Tauri commands.

use crate::comments::{
    format_comments_json, format_comments_readable, format_stdin_output_json,
    format_stdin_output_readable, parse_comments_for_output, insert_nextline_comment as insert_nextline_comment_internal,
    insert_wrapped_comment as insert_wrapped_comment_internal, remove_comment as remove_comment_internal,
};
use crate::config::{load_config as load_config_internal, save_config as save_config_internal, AppConfig};
use crate::file_ops::AppState;
use axum::{
    body::Body,
    extract::{Extension, Json, Path},
    http::{header, Response, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use tower_http::cors::{Any, CorsLayer};

/// Embedded frontend assets from the dist folder
#[derive(RustEmbed)]
#[folder = "../dist"]
struct Assets;

/// Shared state for the web server
pub struct WebState {
    pub app_state: Arc<AppState>,
    pub shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
}

/// Response for the quit endpoint
#[derive(Serialize)]
pub struct QuitResponse {
    pub success: bool,
    pub output: String,
    pub comments_count: usize,
}

/// Request body for read_file
#[derive(Deserialize)]
pub struct ReadFileRequest {
    pub path: String,
}

/// Request body for write_file
#[derive(Deserialize)]
pub struct WriteFileRequest {
    pub path: String,
    pub content: String,
}

/// Request body for set_current_file
#[derive(Deserialize)]
pub struct SetCurrentFileRequest {
    pub path: String,
}

/// Request body for parse_comments
#[derive(Deserialize)]
pub struct ParseCommentsRequest {
    pub content: String,
}

/// Request body for insert_wrapped_comment
#[derive(Deserialize)]
pub struct InsertWrappedCommentRequest {
    pub content: String,
    pub start_pos: usize,
    pub end_pos: usize,
    pub text: String,
}

/// Request body for insert_nextline_comment
#[derive(Deserialize)]
pub struct InsertNextlineCommentRequest {
    pub content: String,
    pub line_start_pos: usize,
    pub line_end_pos: usize,
    pub text: String,
}

/// Request body for remove_comment
#[derive(Deserialize)]
pub struct RemoveCommentRequest {
    pub content: String,
    pub comment_id: String,
}

/// Response for insert comment operations
#[derive(Serialize)]
pub struct InsertCommentResponse {
    pub content: String,
    pub id: String,
}

/// Create the router with all API endpoints
pub fn create_router(state: Arc<WebState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Static assets
        .route("/", get(serve_index))
        .route("/assets/{*path}", get(serve_asset))
        // API endpoints
        .route("/api/version", get(get_version))
        .route("/api/current-file", get(get_current_file))
        .route("/api/read-file", post(read_file))
        .route("/api/write-file", post(write_file))
        .route("/api/set-current-file", post(set_current_file))
        .route("/api/is-stdin-mode", get(is_stdin_mode))
        .route("/api/config", get(get_config))
        .route("/api/config", post(post_config))
        .route("/api/parse-comments", post(parse_comments))
        .route("/api/insert-wrapped-comment", post(insert_wrapped_comment))
        .route("/api/insert-nextline-comment", post(insert_nextline_comment))
        .route("/api/remove-comment", post(remove_comment))
        .route("/api/quit", post(quit))
        // Web mode indicator
        .route("/api/is-web-mode", get(is_web_mode))
        .layer(cors)
        .layer(Extension(state))
}

/// Serve index.html
async fn serve_index() -> impl IntoResponse {
    match Assets::get("index.html") {
        Some(content) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(Body::from(content.data.into_owned()))
            .unwrap(),
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("index.html not found"))
            .unwrap(),
    }
}

/// Serve static assets from /assets/*
async fn serve_asset(Path(path): Path<String>) -> impl IntoResponse {
    let asset_path = format!("assets/{}", path);
    match Assets::get(&asset_path) {
        Some(content) => {
            let mime = mime_guess::from_path(&asset_path)
                .first_or_octet_stream()
                .to_string();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .body(Body::from(content.data.into_owned()))
                .unwrap()
        }
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from(format!("Asset not found: {}", path)))
            .unwrap(),
    }
}

/// GET /api/version
async fn get_version() -> impl IntoResponse {
    Json(env!("CARGO_PKG_VERSION").to_string())
}

/// GET /api/current-file
async fn get_current_file(Extension(state): Extension<Arc<WebState>>) -> impl IntoResponse {
    let current = state.app_state.current_file.lock().ok();
    let path = current.and_then(|f| f.as_ref().map(|p| p.to_string_lossy().to_string()));
    Json(path)
}

/// POST /api/read-file
async fn read_file(
    Json(req): Json<ReadFileRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    std::fs::read_to_string(&req.path)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/write-file
async fn write_file(
    Json(req): Json<WriteFileRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    std::fs::write(&req.path, &req.content)
        .map(|_| Json(()))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// POST /api/set-current-file
async fn set_current_file(
    Extension(state): Extension<Arc<WebState>>,
    Json(req): Json<SetCurrentFileRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut current = state
        .app_state
        .current_file
        .lock()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    *current = Some(PathBuf::from(req.path));
    Ok(Json(()))
}

/// GET /api/is-stdin-mode
async fn is_stdin_mode(Extension(state): Extension<Arc<WebState>>) -> impl IntoResponse {
    Json(state.app_state.stdin_mode)
}

/// GET /api/config
async fn get_config() -> impl IntoResponse {
    Json(load_config_internal())
}

/// POST /api/config
async fn post_config(Json(config): Json<AppConfig>) -> Result<impl IntoResponse, (StatusCode, String)> {
    save_config_internal(config)
        .map(|_| Json(()))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))
}

/// POST /api/parse-comments
async fn parse_comments(Json(req): Json<ParseCommentsRequest>) -> impl IntoResponse {
    let comments = crate::comments::parse_comments(req.content);
    Json(comments)
}

/// POST /api/insert-wrapped-comment
async fn insert_wrapped_comment(
    Json(req): Json<InsertWrappedCommentRequest>,
) -> impl IntoResponse {
    let (content, id) = insert_wrapped_comment_internal(req.content, req.start_pos, req.end_pos, req.text);
    Json(InsertCommentResponse { content, id })
}

/// POST /api/insert-nextline-comment
async fn insert_nextline_comment(
    Json(req): Json<InsertNextlineCommentRequest>,
) -> impl IntoResponse {
    let (content, id) = insert_nextline_comment_internal(req.content, req.line_start_pos, req.line_end_pos, req.text);
    Json(InsertCommentResponse { content, id })
}

/// POST /api/remove-comment
async fn remove_comment(Json(req): Json<RemoveCommentRequest>) -> impl IntoResponse {
    let content = remove_comment_internal(req.content, req.comment_id);
    Json(content)
}

/// GET /api/is-web-mode - Returns true to indicate we're in web mode
async fn is_web_mode() -> impl IntoResponse {
    Json(true)
}

/// POST /api/quit - Triggers shutdown and returns final report
async fn quit(Extension(state): Extension<Arc<WebState>>) -> impl IntoResponse {
    let app_state = &state.app_state;

    // Generate output based on current file state
    if !app_state.silent {
        if let Some(file_path) = app_state.current_file.lock().ok().and_then(|f| f.clone()) {
            if let Ok(content) = std::fs::read_to_string(&file_path) {
                let comments = parse_comments_for_output(&content);
                let comments_count = comments.len();

                let output_str = if app_state.stdin_mode {
                    let file_path_str = file_path.to_string_lossy().to_string();
                    let modified = app_state
                        .original_content
                        .lock()
                        .ok()
                        .and_then(|orig| orig.as_ref().map(|o| o != &content))
                        .unwrap_or(false);

                    if app_state.json_output {
                        format_stdin_output_json(&file_path_str, &content, &comments, modified)
                    } else {
                        format_stdin_output_readable(&file_path_str, &content, &comments, modified)
                    }
                } else if !comments.is_empty() {
                    if app_state.json_output {
                        format_comments_json(&comments)
                    } else {
                        format_comments_readable(&comments)
                    }
                } else {
                    String::new()
                };

                // Print to stdout (same behavior as Tauri close)
                if !output_str.is_empty() {
                    println!("{}", output_str);
                }

                let response = QuitResponse {
                    success: true,
                    output: output_str,
                    comments_count,
                };

                // Trigger shutdown
                if let Ok(mut shutdown_tx) = state.shutdown_tx.lock() {
                    if let Some(tx) = shutdown_tx.take() {
                        let _ = tx.send(());
                    }
                }

                return Json(response);
            }
        }
    }

    // No file loaded or silent mode
    if let Ok(mut shutdown_tx) = state.shutdown_tx.lock() {
        if let Some(tx) = shutdown_tx.take() {
            let _ = tx.send(());
        }
    }

    Json(QuitResponse {
        success: true,
        output: String::new(),
        comments_count: 0,
    })
}

/// Start the web server on the specified port
pub async fn start_server(
    port: u16,
    app_state: Arc<AppState>,
) -> Result<oneshot::Receiver<()>, Box<dyn std::error::Error + Send + Sync>> {
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    let web_state = Arc::new(WebState {
        app_state,
        shutdown_tx: Mutex::new(Some(shutdown_tx)),
    });

    let app = create_router(web_state);

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port)).await?;

    println!("Web server running at http://127.0.0.1:{}", port);

    // Spawn server in background
    tokio::spawn(async move {
        axum::serve(listener, app).await.ok();
    });

    Ok(shutdown_rx)
}
