-- Apply once in Supabase SQL Editor before deploying this version.
alter table public.messages add column if not exists sources jsonb not null default '[]';
create table public.citation_reports (
 id uuid primary key default uuid_generate_v4(),
 user_id uuid not null references auth.users(id) on delete cascade,
 message_id uuid not null references public.messages(id) on delete cascade,
 reason text not null check(length(reason) between 3 and 2000),
 message_content text not null, sources jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.citation_reports enable row level security;
create policy reports_read on public.citation_reports for select to authenticated using(user_id=auth.uid());
create policy reports_insert on public.citation_reports for insert to authenticated with check (
 user_id=auth.uid() and exists(select 1 from public.messages m join public.chats c on c.id=m.chat_id
 where m.id=message_id and c.user_id=auth.uid() and m.role='assistant'));
grant select, insert on public.citation_reports to authenticated;

create table public.chat_requests (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id text not null, fingerprint text not null, lease uuid not null,
 state text not null default 'running', updated_at timestamptz not null default now(),
 chat_id uuid references public.chats(id) on delete cascade,
 result jsonb, primary key(user_id,request_id)
);
alter table public.chat_requests enable row level security;
-- Only the functions below may write request state.
create policy requests_read on public.chat_requests for select to authenticated using(user_id=auth.uid());
grant select on public.chat_requests to authenticated;

create or replace function public.claim_chat_request(p_id text, p_fingerprint text, p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.chat_requests;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.chat_requests(user_id,request_id,fingerprint,lease)
 values(auth.uid(),p_id,p_fingerprint,p_lease) on conflict do nothing;
 select * into r from public.chat_requests where user_id=auth.uid() and request_id=p_id for update;
 if r.fingerprint<>p_fingerprint then return jsonb_build_object('state','conflict'); end if;
 if r.state='done' then return jsonb_build_object('state','done','result',r.result); end if;
 if r.lease=p_lease or r.state='failed' or r.updated_at<now()-interval '5 minutes' then
  update public.chat_requests set state='running',lease=p_lease,updated_at=now() where user_id=auth.uid() and request_id=p_id;
  return jsonb_build_object('state','claimed');
 end if;
 return jsonb_build_object('state','busy');
end $$;

create or replace function public.fail_chat_request(p_id text,p_lease uuid)
returns void language sql security definer set search_path=public as $$
 update public.chat_requests set state='failed' where user_id=auth.uid() and request_id=p_id and lease=p_lease and state='running';
$$;

create or replace function public.complete_chat_request(p_id text,p_lease uuid,p_chat uuid,p_user_content text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.chat_requests; mid uuid; payload jsonb;
begin
 select * into r from public.chat_requests where user_id=auth.uid() and request_id=p_id for update;
 if not found or r.lease<>p_lease or r.state<>'running' then raise exception 'Request lease expired'; end if;
 if not exists(select 1 from public.chats where id=p_chat and user_id=auth.uid()) then raise exception 'Chat access denied'; end if;
 insert into public.messages(chat_id,role,content) values(p_chat,'user',p_user_content);
 insert into public.messages(chat_id,role,content,sources) values(p_chat,'assistant',p_payload->>'response',coalesce(p_payload->'sources','[]')) returning id into mid;
 update public.chats set updated_at=now(),title=coalesce(p_payload->>'title',title) where id=p_chat;
 payload=p_payload || jsonb_build_object('chat_id',p_chat,'message_id',mid);
 update public.chat_requests set state='done',result=payload,chat_id=p_chat,updated_at=now() where user_id=auth.uid() and request_id=p_id;
 return payload;
end $$;
revoke all on function public.claim_chat_request(text,text,uuid) from public;
revoke all on function public.fail_chat_request(text,uuid) from public;
revoke all on function public.complete_chat_request(text,uuid,uuid,text,jsonb) from public;
grant execute on function public.claim_chat_request(text,text,uuid), public.fail_chat_request(text,uuid), public.complete_chat_request(text,uuid,uuid,text,jsonb) to authenticated;
