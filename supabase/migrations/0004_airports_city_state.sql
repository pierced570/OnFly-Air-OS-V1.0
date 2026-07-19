-- City/state on airports so pickers can show ICAO + place (avoid wrong field).
alter table airports add column if not exists city text;
alter table airports add column if not exists state text;
