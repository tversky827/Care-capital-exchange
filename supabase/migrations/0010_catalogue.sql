-- ---------------------------------------------------------------------------
-- 0010 — the demonstration catalogue
--
-- A second catalogue of properties and raises, entirely fictional, for showing
-- the product to somebody. It lives in the same tables as the live one because
-- the whole value of a demonstration is that it is the actual product: a
-- separate `demo_offerings` table would mean a separate deal page, document
-- viewer, analysis and ticket, and what got demonstrated would be the copy.
--
-- What keeps them apart is this column and the queries that filter on it. That
-- is a weaker boundary than the sandbox ledger's, and deliberately so — the
-- risk here is a READ leaking the wrong way, not a write moving money. The two
-- failures are not the same size and do not deserve the same mechanism.
--
-- The default is 'live'. Every row that exists before this migration is real
-- catalogue, and a row inserted by code that has never heard of environments
-- stays real catalogue rather than silently becoming a demonstration.
-- ---------------------------------------------------------------------------

create type catalogue_environment as enum ('live', 'demo');

alter table deals
  add column environment catalogue_environment not null default 'live';

alter table offerings
  add column environment catalogue_environment not null default 'live';

create index deals_environment on deals (environment);
create index offerings_environment on offerings (environment, status);

-- A raise cannot advertise a property from the other catalogue. Without this a
-- demonstration offering could point at a real property, and a person shown
-- "fictional" data would be reading a real operator's figures.
create or replace function ccx_offering_catalogue_matches()
returns trigger language plpgsql as $$
declare
  deal_environment catalogue_environment;
begin
  select environment into deal_environment from deals where id = new.deal_id;
  if deal_environment is null then
    raise exception 'offering references a deal that does not exist';
  end if;
  if new.environment <> deal_environment then
    raise exception 'a % offering cannot be raised against a % property',
      new.environment, deal_environment;
  end if;
  return new;
end;
$$;

create trigger offerings_catalogue_matches
  before insert or update on offerings
  for each row execute function ccx_offering_catalogue_matches();
