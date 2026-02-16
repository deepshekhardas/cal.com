import { filterQuerySchema } from "@calcom/lib/zod/filter";
import { useTypedQuery } from "@calcom/lib/hooks/useTypedQuery";

export function useFilterQuery() {
  return useTypedQuery(filterQuerySchema);
}
