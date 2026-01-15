// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Local;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::{self, IsTerminal, Read};
use std::path::PathBuf;

#[cfg(feature = "web")]
use std::sync::{Arc, Mutex};

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.iter().any(|a| a == "--version" || a == "-v") {
        println!("file-review {}", env!("CARGO_PKG_VERSION"));
        return;
    }

    if args.iter().any(|a| a == "--help" || a == "-h") {
        print_help();
        return;
    }

    // Parse flags
    let silent = args.iter().any(|a| a == "--silent" || a == "-s");
    let json_output = args.iter().any(|a| a == "--json" || a == "-j");
    let web_mode = args.iter().any(|a| a == "--web" || a == "-w");
    let tunnel_enabled = args.iter().any(|a| a == "--tunnel" || a == "-t");

    // Parse --port argument
    let port: u16 = args
        .windows(2)
        .find(|w| w[0] == "--port")
        .and_then(|w| w[1].parse().ok())
        .unwrap_or(3456);

    // Extract file path (first non-flag argument after program name)
    let file_arg = args
        .iter()
        .skip(1)
        .find(|a| !a.starts_with('-') && *a != &port.to_string())
        .cloned();

    // Determine if stdin mode
    let (file_path, stdin_mode, original_content) = match file_arg.as_deref() {
        Some("-") => {
            // Explicit stdin mode with "-" argument
            match read_stdin_to_temp() {
                Ok((path, content)) => {
                    (Some(path.to_string_lossy().to_string()), true, Some(content))
                }
                Err(e) => {
                    eprintln!("Error reading stdin: {}", e);
                    std::process::exit(1);
                }
            }
        }
        None if !io::stdin().is_terminal() => {
            // Auto-detect piped stdin (no file arg and stdin is not a terminal)
            match read_stdin_to_temp() {
                Ok((path, content)) => {
                    (Some(path.to_string_lossy().to_string()), true, Some(content))
                }
                Err(e) => {
                    eprintln!("Error reading stdin: {}", e);
                    std::process::exit(1);
                }
            }
        }
        _ => (file_arg, false, None),
    };

    // Web server mode
    #[cfg(feature = "web")]
    if web_mode {
        run_web_mode(file_path, silent, json_output, stdin_mode, original_content, port, tunnel_enabled);
        return;
    }

    #[cfg(not(feature = "web"))]
    if web_mode {
        eprintln!("Error: Web mode requires the 'web' feature. Rebuild with: cargo build --features web");
        std::process::exit(1);
    }

    // Tauri native mode
    file_review_lib::run(file_path, silent, json_output, stdin_mode, original_content)
}

#[cfg(feature = "web")]
fn run_web_mode(
    file_path: Option<String>,
    silent: bool,
    json_output: bool,
    stdin_mode: bool,
    original_content: Option<String>,
    port: u16,
    tunnel_enabled: bool,
) {
    use file_review_lib::file_ops::AppState;
    use file_review_lib::tunnel::TunnelManager;
    use file_review_lib::web_server;

    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");

    rt.block_on(async {
        // Create app state
        let app_state = Arc::new(AppState {
            current_file: Mutex::new(file_path.as_ref().map(PathBuf::from)),
            silent,
            json_output,
            stdin_mode,
            original_content: Mutex::new(original_content),
        });

        // Start web server
        let shutdown_rx = match web_server::start_server(port, app_state).await {
            Ok(rx) => rx,
            Err(e) => {
                eprintln!("Failed to start web server: {}", e);
                std::process::exit(1);
            }
        };

        // Handle tunnel if enabled
        let _tunnel: Option<TunnelManager> = if tunnel_enabled {
            println!("Starting localtunnel...");
            match TunnelManager::start(port) {
                Ok(tunnel) => {
                    // Wait for the tunnel URL (up to 10 seconds)
                    if let Some(url) = tunnel.wait_for_url(10).await {
                        println!("Tunnel URL: {}", url);
                        println!("Share this URL for remote access.");
                    } else {
                        eprintln!("Warning: Could not get tunnel URL. Tunnel may not be working.");
                        eprintln!("Make sure Node.js and npx are installed.");
                    }
                    Some(tunnel)
                }
                Err(e) => {
                    eprintln!("Failed to start tunnel: {}", e);
                    eprintln!("Continuing without tunnel. Use local URL.");
                    None
                }
            }
        } else {
            None
        };

        // Open browser (local URL)
        let url = format!("http://127.0.0.1:{}", port);
        if let Err(e) = open::that(&url) {
            eprintln!("Failed to open browser: {}", e);
            eprintln!("Please manually open: {}", url);
        }

        // Wait for shutdown signal or Ctrl+C
        tokio::select! {
            _ = shutdown_rx => {
                println!("Shutdown signal received, exiting...");
            }
            _ = tokio::signal::ctrl_c() => {
                println!("\nCtrl+C received, exiting...");
            }
        }

        // Cleanup tunnel if it was started
        if let Some(tunnel) = _tunnel {
            tunnel.stop().await;
        }
    });
}

/// Read all stdin content and write to a persistent temp file
fn read_stdin_to_temp() -> io::Result<(PathBuf, String)> {
    let mut content = String::new();
    io::stdin().read_to_string(&mut content)?;

    // Check for empty content
    if content.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "stdin is empty - nothing to review",
        ));
    }

    // Warn about large content (but still proceed)
    if content.len() > 10_000_000 {
        eprintln!(
            "Warning: Large content ({} bytes) may affect performance",
            content.len()
        );
    }

    // Generate unique filename with timestamp and content hash
    let timestamp = Local::now().format("%Y%m%d").to_string();
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    let hash = format!("{:x}", hasher.finish());
    let hash_short = &hash[..8.min(hash.len())];
    let filename = format!("file-review-{}-{}.md", timestamp, hash_short);
    let path = std::env::temp_dir().join(filename);

    // Write content to temp file (persistent - not auto-deleted)
    std::fs::write(&path, &content)?;

    Ok((path, content))
}

fn print_help() {
    let config_path = file_review_lib::config::get_config_path();

    println!("file-review - Code review tool with inline comments\n");
    println!("USAGE:");
    println!("    file-review [OPTIONS] [FILE]");
    println!("    file-review --web [OPTIONS] [FILE]     # Web server mode");
    println!("    cat content.md | file-review [OPTIONS]");
    println!("    file-review - [OPTIONS]                # Read from stdin\n");
    println!("OPTIONS:");
    println!("    -h, --help       Show this help message");
    println!("    -v, --version    Show version");
    println!("    -s, --silent     Suppress output on close");
    println!("    -j, --json       Output as JSON on close\n");
    println!("WEB MODE:");
    println!("    -w, --web        Start in web server mode (opens browser)");
    println!("    -t, --tunnel     Enable localtunnel for remote access (requires --web)");
    println!("    --port PORT      HTTP server port (default: 3456)\n");
    println!("OUTPUT:");
    println!("    By default, review comments are printed to stdout when");
    println!("    the application closes. Use --silent to suppress this,");
    println!("    or --json for machine-readable output.\n");
    println!("    In stdin mode, output includes file path, content, and comments.\n");
    println!("CONFIG:");
    println!("    Path: {}", config_path.display());

    if config_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            println!("\n    Contents:");
            for line in content.lines() {
                println!("    {}", line);
            }
        }
    } else {
        println!("    (not created yet - using defaults)");
    }
}
