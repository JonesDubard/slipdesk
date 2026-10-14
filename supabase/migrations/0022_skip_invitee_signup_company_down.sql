-- Removes the invited-signup company cleanup. handle_new_user() is unchanged.

begin;

drop trigger if exists zz_remove_invitee_signup_company on auth.users;
drop function if exists public.remove_invitee_signup_company();

commit;
