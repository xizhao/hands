use std::path::PathBuf;
use std::fs;

fn main() {
    tauri_build::build();

    // Copy opencode resources to target directory for dev mode
    // This ensures agents/tools/plugins are available during development
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let resources_src = PathBuf::from(&manifest_dir).join("resources/opencode");

    // Get the target directory (e.g., target/debug or target/release)
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let out_path = PathBuf::from(&out_dir);

    // OUT_DIR is something like target/debug/build/<crate>/out
    // We need to go up to target/debug
    let target_dir = out_path
        .parent().unwrap()  // build/<crate>
        .parent().unwrap()  // build
        .parent().unwrap(); // target/debug or target/release

    let resources_dst = target_dir.join("opencode");

    if resources_src.exists() {
        // Remove existing to ensure clean copy
        if resources_dst.exists() {
            let _ = fs::remove_dir_all(&resources_dst);
        }

        // Copy recursively
        copy_dir_recursive(&resources_src, &resources_dst)
            .expect("Failed to copy opencode resources");

        println!("cargo:warning=Copied opencode resources to {:?}", resources_dst);
    }

    // Tell cargo to rerun if resources change
    println!("cargo:rerun-if-changed=resources/opencode");
}

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());

        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            fs::copy(&path, &dest_path)?;
        }
    }

    Ok(())
}
