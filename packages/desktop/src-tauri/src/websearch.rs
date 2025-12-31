//! Web search module using DuckDuckGo as the default provider
//!
//! Provides web search capabilities for the agent to gather information
//! from the internet without requiring API keys.

use futures_util::future::join_all;
use serde::{Deserialize, Serialize};
use websearch::{providers::DuckDuckGoProvider, web_search, SearchOptions};

/// A single search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResult {
    /// Title of the search result
    pub title: String,
    /// URL of the search result
    pub url: String,
    /// Snippet/description of the search result
    pub snippet: Option<String>,
}

/// Response from a web search operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResponse {
    /// The search query that was executed
    pub query: String,
    /// List of search results
    pub results: Vec<WebSearchResult>,
    /// Number of results returned
    pub count: usize,
}

/// Perform a web search using DuckDuckGo
///
/// # Arguments
/// * `query` - The search query
/// * `max_results` - Maximum number of results to return (default: 10)
#[tauri::command]
pub async fn websearch_query(
    query: String,
    max_results: Option<usize>,
) -> Result<WebSearchResponse, String> {
    let max = max_results.unwrap_or(10);

    let provider = DuckDuckGoProvider::new();

    let results = web_search(SearchOptions {
        query: query.clone(),
        max_results: Some(max as u32),
        provider: Box::new(provider),
        ..Default::default()
    })
    .await
    .map_err(|e| format!("Search failed: {}", e))?;

    let search_results: Vec<WebSearchResult> = results
        .into_iter()
        .map(|r| WebSearchResult {
            title: r.title,
            url: r.url,
            snippet: r.snippet,
        })
        .collect();

    let count = search_results.len();

    Ok(WebSearchResponse {
        query,
        results: search_results,
        count,
    })
}

/// Perform multiple web searches in parallel
///
/// # Arguments
/// * `queries` - List of search queries to execute
/// * `max_results_per_query` - Maximum results per query (default: 5)
#[tauri::command]
pub async fn websearch_batch(
    queries: Vec<String>,
    max_results_per_query: Option<usize>,
) -> Result<Vec<WebSearchResponse>, String> {
    let max = max_results_per_query.unwrap_or(5);

    // Execute searches in parallel
    let futures: Vec<_> = queries
        .into_iter()
        .map(|query| {
            let q = query.clone();
            async move {
                let provider = DuckDuckGoProvider::new();
                let results = web_search(SearchOptions {
                    query: query.clone(),
                    max_results: Some(max as u32),
                    provider: Box::new(provider),
                    ..Default::default()
                })
                .await;

                (q, results)
            }
        })
        .collect();

    let results = join_all(futures).await;

    let mut responses = Vec::new();
    for (query, result) in results {
        match result {
            Ok(search_results) => {
                let search_results: Vec<WebSearchResult> = search_results
                    .into_iter()
                    .map(|r| WebSearchResult {
                        title: r.title,
                        url: r.url,
                        snippet: r.snippet,
                    })
                    .collect();

                let count = search_results.len();
                responses.push(WebSearchResponse {
                    query,
                    results: search_results,
                    count,
                });
            }
            Err(e) => {
                // Include failed searches with empty results and error in query field
                responses.push(WebSearchResponse {
                    query: format!("{} (error: {})", query, e),
                    results: vec![],
                    count: 0,
                });
            }
        }
    }

    Ok(responses)
}
