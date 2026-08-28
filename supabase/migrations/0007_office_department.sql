-- 事務部門を staff に追加する。
--
-- legacy(webapp/app.js:1176)の事務部門は「現場・ダンプを持たない、氏名+出退勤のみ」で、
-- 配置枠にも現場にも入らない。そのため placement_slots.department は意図的に
-- ('土木', '運輸') のまま据え置く。ここを開けると「事務部門の現場」という
-- 存在しない概念が作れてしまうため、DB側で塞いだままにする。

alter table staff
  drop constraint staff_department_check;

alter table staff
  add constraint staff_department_check
  check (department in ('土木', '運輸', '事務'));
