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

    file_review_lib::run()
}

fn print_help() {
    let config_path = file_review_lib::config::get_config_path();

    println!("file-review - Code review tool with inline comments\n");
    println!("USAGE:");
    println!("    file-review [OPTIONS] [FILE]\n");
    println!("OPTIONS:");
    println!("    -h, --help       Show this help message");
    println!("    -v, --version    Show version\n");
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
