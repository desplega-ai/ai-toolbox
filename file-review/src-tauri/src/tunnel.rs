//! Tunnel management for exposing local server via localtunnel
//!
//! Uses a Node.js subprocess to run localtunnel for reliable tunneling.

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Manages a localtunnel subprocess
pub struct TunnelManager {
    process: Arc<Mutex<Option<Child>>>,
    public_url: Arc<Mutex<Option<String>>>,
}

impl TunnelManager {
    /// Start a new tunnel on the specified port with optional subdomain
    ///
    /// This spawns `npx @desplega.ai/localtunnel --port PORT [--subdomain SUBDOMAIN]` as a subprocess
    /// and parses the stdout to get the public URL.
    pub fn start(port: u16, subdomain: Option<&str>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        // Build args - need owned strings for lifetime
        let port_str = port.to_string();
        let mut args = vec!["@desplega.ai/localtunnel", "--port", &port_str];
        let subdomain_owned: String;
        if let Some(sub) = subdomain {
            subdomain_owned = sub.to_string();
            args.push("--subdomain");
            args.push(&subdomain_owned);
        }

        // Try to spawn the localtunnel process
        let mut child = Command::new("npx")
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start localtunnel: {}. Make sure Node.js/npm is installed.", e))?;

        // Read stdout to get the URL
        let stdout = child.stdout.take()
            .ok_or("Failed to capture stdout from localtunnel")?;

        let public_url = Arc::new(Mutex::new(None::<String>));
        let url_clone = public_url.clone();

        // Spawn a thread to read the URL from stdout
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line) = line {
                    // Print tunnel output for debugging
                    eprintln!("[tunnel] {}", line);

                    // Localtunnel prints "your url is: https://xxx.lt.desplega.ai"
                    if line.to_lowercase().contains("your url is:") {
                        if let Some(url) = line.split_whitespace().last() {
                            let mut guard = url_clone.blocking_lock();
                            *guard = Some(url.to_string());
                        }
                    } else if line.starts_with("https://") {
                        // Some versions just print the URL directly
                        let mut guard = url_clone.blocking_lock();
                        *guard = Some(line);
                    }
                }
            }
        });

        Ok(Self {
            process: Arc::new(Mutex::new(Some(child))),
            public_url,
        })
    }

    /// Get the public tunnel URL, if available
    pub async fn get_url(&self) -> Option<String> {
        let guard = self.public_url.lock().await;
        guard.clone()
    }

    /// Wait for the tunnel URL to become available (with timeout)
    pub async fn wait_for_url(&self, timeout_secs: u64) -> Option<String> {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(timeout_secs);

        while start.elapsed() < timeout {
            if let Some(url) = self.get_url().await {
                return Some(url);
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }

        None
    }

    /// Stop the tunnel subprocess
    pub async fn stop(&self) {
        let mut guard = self.process.lock().await;
        if let Some(mut child) = guard.take() {
            // Try to kill the process gracefully
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for TunnelManager {
    fn drop(&mut self) {
        // Try to clean up the process on drop
        if let Ok(mut guard) = self.process.try_lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}
