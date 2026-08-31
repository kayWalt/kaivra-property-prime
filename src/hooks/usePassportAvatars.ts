import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPassportAvatars } from "@/lib/passports.functions";

/**
 * Batch-loads signed passport photo URLs for a set of investors.
 * One request for the whole list (no N+1), cached until shortly before the
 * signed URLs expire.
 */
export function usePassportAvatars(investorIds: string[]) {
  const fetchAvatars = useServerFn(getPassportAvatars);
  const ids = [...new Set(investorIds)].sort();

  const query = useQuery({
    queryKey: ["passport-avatars", ids],
    enabled: ids.length > 0,
    staleTime: 45 * 60 * 1000,
    gcTime: 50 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await fetchAvatars({ data: { investorIds: ids } });
      return res.avatars as Record<string, string>;
    },
  });

  return {
    avatars: query.data ?? {},
    isLoading: ids.length > 0 && query.isLoading,
  };
}
