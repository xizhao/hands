/**
 * Block Registry
 *
 * Maintains a registry of discovered blocks for fast lookup.
 */

import type { BlockMeta, DiscoveredBlock } from "@hands/stdlib";
import { type BlockDiscoveryResult, discoverBlocks } from "./discovery.js";

/**
 * Block registry for runtime use
 */
export class BlockRegistry {
  private blocks: Map<string, DiscoveredBlock> = new Map();
  private blocksDir: string;
  private errors: Array<{ file: string; error: string }> = [];

  constructor(blocksDir: string) {
    this.blocksDir = blocksDir;
  }

  /**
   * Load/reload blocks from the directory
   */
  async load(): Promise<BlockDiscoveryResult> {
    const result = await discoverBlocks(this.blocksDir);

    // Clear and repopulate registry
    this.blocks.clear();
    this.errors = result.errors;

    for (const block of result.blocks) {
      this.blocks.set(block.id, block);
    }

    return result;
  }

  /**
   * Get a block by ID
   */
  get(id: string): DiscoveredBlock | undefined {
    return this.blocks.get(id);
  }

  /**
   * Check if a block exists
   */
  has(id: string): boolean {
    return this.blocks.has(id);
  }

  /**
   * List all block IDs
   */
  ids(): string[] {
    return Array.from(this.blocks.keys());
  }

  /**
   * List all blocks
   */
  list(): DiscoveredBlock[] {
    return Array.from(this.blocks.values());
  }

  /**
   * Get metadata for all blocks
   */
  meta(): Array<{ id: string; meta: BlockMeta }> {
    return this.list().map((block) => ({
      id: block.id,
      meta: block.meta,
    }));
  }

  /**
   * Get discovery errors
   */
  getErrors(): Array<{ file: string; error: string }> {
    return this.errors;
  }

  /**
   * Get block count
   */
  get size(): number {
    return this.blocks.size;
  }
}
