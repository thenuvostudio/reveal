"use client";
import { create } from "zustand";
/** Where the reader is in the feed (updated when the page changes, not on every scroll event). */
export const useFeedPos = create<{ page: number; bookId: string | null; firstId: string | null; pageIds: string[] }>(() => ({ page: 0, bookId: null, firstId: null, pageIds: [] }));
