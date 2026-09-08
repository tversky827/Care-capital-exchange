-- ---------------------------------------------------------------------------
-- 0011 — guest accounts
--
-- Somebody who wants to see the product should not have to create an account
-- first. A guest account is made on the spot, gets its own isolated
-- demonstration sandbox, and can do nothing else.
--
-- What "nothing else" means is enforced rather than implied. A guest has no
-- password, so it cannot be signed into through the ordinary form; it is
-- confined to the fictional catalogue, so it never reads a real operator's
-- figures; and the live money path refuses it outright. The last one matters
-- most: an account anybody on the internet can create in one click must not be
-- able to open an investment account or place an order.
--
-- Guests are expected to be numerous and disposable. The index exists so they
-- can be found and pruned without scanning every user.
-- ---------------------------------------------------------------------------

alter table users
  add column is_guest boolean not null default false;

create index users_guest on users (is_guest, created_at) where is_guest;

-- A guest never has a password. Enforced here as well as in the service,
-- because a guest with a password is an account somebody could come back to
-- and find somebody else's session in.
alter table users
  add constraint users_guest_has_no_password
  check (not is_guest or password_hash is null);
