import { sequence } from "@sveltejs/kit/hooks";

import { apiHandle } from "$lib/server/hooks/api";

export const handle = sequence(apiHandle);
