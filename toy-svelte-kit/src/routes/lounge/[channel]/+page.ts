import { error } from "@sveltejs/kit";
import { loungeChannels } from "$lib/lounge/shared";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
  const channel = loungeChannels.find((item) => item.id === params.channel);
  if (!channel) error(404, "존재하지 않는 라운지입니다.");
  return { channel };
};
