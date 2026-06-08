"use client";

import NextLink, { type LinkProps } from "next/link";
import {
  createContext,
  type AnchorHTMLAttributes,
  type ReactNode,
  useContext,
} from "react";
import { cleanTournamentHref } from "@/lib/tournament-url";

const TournamentUrlContext = createContext(false);

export function TournamentUrlProvider({
  children,
  cleanUrls,
}: {
  children: ReactNode;
  cleanUrls: boolean;
}) {
  return (
    <TournamentUrlContext.Provider value={cleanUrls}>
      {children}
    </TournamentUrlContext.Provider>
  );
}

export function useTournamentHref(href: string): string {
  const cleanUrls = useContext(TournamentUrlContext);
  return cleanTournamentHref(href, cleanUrls);
}

type TournamentLinkProps = LinkProps
  & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href">;

export function TournamentLink({ href, ...props }: TournamentLinkProps) {
  const cleanUrls = useContext(TournamentUrlContext);
  const normalizedHref =
    typeof href === "string" ? cleanTournamentHref(href, cleanUrls) : href;

  return <NextLink href={normalizedHref} {...props} />;
}
