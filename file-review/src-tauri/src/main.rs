// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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

    // Extract file path (first non-flag argument after program name)
    let file_path = args
        .iter()
        .skip(1)
        .find(|a| !a.starts_with('-'))
        .cloned();

    file_review_lib::run(file_path, silent, json_output)
}

fn print_help() {
    let config_path = file_review_lib::config::get_config_path();

    println!("file-review - Code review tool with inline comments\n");
    println!("USAGE:");
    println!("    file-review [OPTIONS] [FILE]\n");
    println!("OPTIONS:");
    println!("    -h, --help       Show this help message");
    println!("    -v, --version    Show version");
    println!("    -s, --silent     Suppress comment output on close");
    println!("    -j, --json       Output comments as JSON on close\n");
    println!("OUTPUT:");
    println!("    By default, review comments are printed to stdout when");
    println!("    the application closes. Use --silent to suppress this,");
    println!("    or --json for machine-readable output.\n");
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
