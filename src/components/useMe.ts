"use client";
import { useEffect, useState } from "react";

export interface Me {
  user: { id: string; name: string; role: "admin" | "staff" };
  task: { done: number; target: number; workday: boolean; counted: boolean };
  team?: { size: number; done: number; members: number };
  /** 员工：最近被退回的笔记 */
  rejected: { id: string; title: string; review_note: string | null; created_at: string }[];
  /** 管理员：全部待审核篇数；员工：自己待审核的篇数 */
  pending: number;
}

export const AFTER_LOGIN = "wb_after_login";

let cache: Me | null = null;
const listeners = new Set<(m: Me | null) => void>();

export async function refreshMe() {
  const r = await fetch("/api/me");
  cache = r.ok ? await r.json() : null;
  listeners.forEach((f) => f(cache));
  return { me: cache, status: r.status };
}

/** 当前登录的人 + 今日任务。没登录时跳到登录页，并带上完整地址（书签采集的 #xhs= 数据也保留） */
export function useMe() {
  const [me, setMe] = useState<Me | null>(cache);
  useEffect(() => {
    listeners.add(setMe);
    const here = location.pathname + location.search + location.hash;
    refreshMe().then(({ status }) => {
      if (status === 401 && location.pathname !== "/login") {
        // 完整地址（可能带着书签采集的封面数据，很长）存在本标签页里，登录后原样回来；不放进网址里
        try {
          sessionStorage.setItem(AFTER_LOGIN, here);
        } catch {}
        location.replace("/login?next=" + encodeURIComponent(location.pathname));
      }
    });
    return () => {
      listeners.delete(setMe);
    };
  }, []);
  return me;
}
