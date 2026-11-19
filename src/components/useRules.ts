"use client";
import { useEffect, useState } from "react";
import { DEFAULT_RULES, type Rule } from "@/lib/sensitive";

let cache: Rule[] | null = null;

/** 违禁词规则（内置 + 自定义），整个页面只请求一次 */
export function useRules() {
  const [rules, setRules] = useState<Rule[]>(cache ?? DEFAULT_RULES);
  useEffect(() => {
    if (cache) return;
    fetch("/api/sensitive")
      .then((r) => r.json())
      .then((j) => {
        cache = j.rules;
        setRules(j.rules);
      })
      .catch(() => {});
  }, []);
  return rules;
}
