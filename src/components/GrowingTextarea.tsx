"use client";
import { useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";
export default function GrowingTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node) { node.style.height = "auto"; node.style.height = Math.min(node.scrollHeight, 320) + "px"; }
  }, [props.value]);
  return <textarea {...props} ref={ref} rows={3} style={{ ...props.style, maxHeight: 320, overflowY: "auto" }} />;
}
