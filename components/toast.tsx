"use client";
import { useEffect } from "react";
import { create } from "zustand";

const useToast = create<{ msg: string; seq: number }>(() => ({ msg: "", seq: 0 }));
let hideAt = 0;
export function toast(msg: string, ms = 2400) {
  hideAt = Date.now() + ms;
  useToast.setState((s) => ({ msg, seq: s.seq + 1 }));
}
export function Toast() {
  const { msg, seq } = useToast();
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => useToast.setState({ msg: "" }), Math.max(0, hideAt - Date.now()));
    return () => clearTimeout(t);
  }, [msg, seq]);
  return msg ? <div className="toast" role="status" data-testid="toast" key={seq}>{msg}</div> : null;
}
