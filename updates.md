

const firebaseConfig = {
  apiKey: "AIzaSyDzUirzhm4b3Y_TbwWKi4xVxZaeDnOri-U",
  authDomain: "cybersentinel-ec5fb.firebaseapp.com",
  projectId: "cybersentinel-ec5fb",
  storageBucket: "cybersentinel-ec5fb.firebasestorage.app",
  messagingSenderId: "160334798311",
  appId: "1:160334798311:web:771704577fbdf340c67142",
  measurementId: "G-KKR6LYSFLM"
};




# db structure
You are now connected to database "cybersentinel_db" as user "mudit".
cybersentinel_db=> \dt
          List of relations
 Schema |    Name     | Type  | Owner
--------+-------------+-------+-------
 public | answers     | table | mudit
 public | assessments | table | mudit
 public | assignments | table | mudit
 public | questions   | table | mudit
 public | reports     | table | mudit
 public | users       | table | mudit
(6 rows)


cybersentinel_db=> \d answers
                                           Table "public.answers"
    Column    |           Type           | Collation | Nullable |                  Default

--------------+--------------------------+-----------+----------+-----------------------------------------
---
 id           | integer                  |           | not null | nextval('answers_answer_id_seq'::regclas
s)
 session_id   | uuid                     |           |          |
 question_id  | character varying(100)   |           |          |
 created_at   | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 answer_index | integer                  |           |          |
 answer_text  | text                     |           |          |
Indexes:
    "answers_pkey" PRIMARY KEY, btree (id)
Foreign-key constraints:
    "answers_question_id_fkey" FOREIGN KEY (question_id) REFERENCES questions(id)
    "answers_session_id_fkey" FOREIGN KEY (session_id) REFERENCES assessments(session_id) ON DELETE CASCAD
E


cybersentinel_db=> \d assessments
                                        Table "public.assessments"
       Column        |           Type           | Collation | Nullable |             Default
---------------------+--------------------------+-----------+----------+----------------------------------
 session_id          | uuid                     |           | not null | uuid_generate_v4()
 user_id             | integer                  |           |          |
 start_time          | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 end_time            | timestamp with time zone |           |          |
 status              | character varying(50)    |           |          | 'in_progress'::character varying
 current_question_id | character varying(100)   |           |          |
 answers_snapshot    | jsonb                    |           |          |
 created_at          | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 assignment_id       | integer                  |           |          |
Indexes:
    "assessments_pkey" PRIMARY KEY, btree (session_id)
Check constraints:
    "assessments_status_check" CHECK (status::text = ANY (ARRAY['in_progress'::character varying, 'complet
ed'::character varying, 'abandoned'::character varying]::text[]))
Foreign-key constraints:
    "assessments_current_question_id_fkey" FOREIGN KEY (current_question_id) REFERENCES questions(id)
    "assessments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
Referenced by:
    TABLE "answers" CONSTRAINT "answers_session_id_fkey" FOREIGN KEY (session_id) REFERENCES assessments(s
ession_id) ON DELETE CASCADE
    TABLE "reports" CONSTRAINT "reports_session_id_fkey" FOREIGN KEY (session_id) REFERENCES assessments(s
ession_id) ON DELETE CASCADE


cybersentinel_db=> \d assignments
                                               Table "public.assignments"
     Column      |           Type           | Collation | Nullable |                      Default

-----------------+--------------------------+-----------+----------+--------------------------------------
--------------
 assignment_id   | integer                  |           | not null | nextval('assignments_assignment_id_se
q'::regclass)
 user_id         | integer                  |           |          |
 assessment_type | character varying(100)   |           |          | 'standard'::character varying
 due_date        | date                     |           | not null |
 created_at      | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 status          | character varying(50)    |           |          | 'pending'::character varying
Indexes:
    "assignments_pkey" PRIMARY KEY, btree (assignment_id)
Check constraints:
    "assignments_status_check" CHECK (status::text = ANY (ARRAY['pending'::character varying, 'in_progress
'::character varying, 'completed'::character varying, 'overdue'::character varying]::text[]))
Foreign-key constraints:
    "assignments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE


cybersentinel_db=> \d questions
                             Table "public.questions"
   Column   |           Type           | Collation | Nullable |      Default
------------+--------------------------+-----------+----------+-------------------
 id         | character varying(100)   |           | not null |
 text       | text                     |           | not null |
 options    | jsonb                    |           | not null |
 category   | character varying(50)    |           |          |
 next_logic | jsonb                    |           |          |
 patterns   | jsonb                    |           |          | '{}'::jsonb
 version    | integer                  |           |          | 1
 is_active  | boolean                  |           |          | true
 tags       | jsonb                    |           |          |
 created_at | timestamp with time zone |           |          | CURRENT_TIMESTAMP
 updated_at | timestamp with time zone |           |          | CURRENT_TIMESTAMP
Indexes:
    "questions_pkey" PRIMARY KEY, btree (id)
Check constraints:
    "questions_category_check" CHECK (category::text = ANY (ARRAY['technical'::character varying, 'behavio
ral'::character varying, 'psychological'::character varying]::text[]))
    "questions_options_nonempty" CHECK (jsonb_typeof(options) = 'array'::text AND jsonb_array_length(optio
ns) >= 2)
Referenced by:
    TABLE "answers" CONSTRAINT "answers_question_id_fkey" FOREIGN KEY (question_id) REFERENCES questions(i
d)
    TABLE "assessments" CONSTRAINT "assessments_current_question_id_fkey" FOREIGN KEY (current_question_id
) REFERENCES questions(id)


cybersentinel_db=> \d reports
                                                 Table "public.reports"
        Column         |            Type             | Collation | Nullable |                  Default

-----------------------+-----------------------------+-----------+----------+-----------------------------
---------------
 id                    | integer                     |           | not null | nextval('reports_report_id_s
eq'::regclass)
 session_id            | uuid                        |           |          |
 overall_score         | integer                     |           |          |
 category_scores       | jsonb                       |           |          |
 behavioral_patterns   | jsonb                       |           |          |
 psychological_factors | jsonb                       |           |          |
 executive_summary     | text                        |           |          |
 recommendations       | jsonb                       |           |          |
 strengths             | jsonb                       |           |          |
 created_at            | timestamp without time zone |           |          | CURRENT_TIMESTAMP
Indexes:
    "reports_pkey" PRIMARY KEY, btree (id)
    "reports_session_id_key" UNIQUE CONSTRAINT, btree (session_id)
Check constraints:
    "reports_overall_score_check" CHECK (overall_score >= 0 AND overall_score <= 100)
Foreign-key constraints:
    "reports_session_id_fkey" FOREIGN KEY (session_id) REFERENCES assessments(session_id) ON DELETE CASCAD
E


cybersentinel_db=> \d users
                                          Table "public.users"
    Column     |            Type             | Collation | Nullable |              Default
---------------+-----------------------------+-----------+----------+-----------------------------------
 id            | integer                     |           | not null | nextval('users_id_seq'::regclass)
 email         | character varying(255)      |           | not null |
 password_hash | character varying(255)      |           | not null |
 name          | character varying(255)      |           | not null |
 role          | character varying(50)       |           | not null |
 department    | character varying(100)      |           |          |
 created_at    | timestamp with time zone    |           |          | CURRENT_TIMESTAMP
 updated_at    | timestamp without time zone |           |          | CURRENT_TIMESTAMP
Indexes:
    "users_pkey" PRIMARY KEY, btree (id)
    "users_email_key" UNIQUE CONSTRAINT, btree (email)
Check constraints:
    "users_role_check" CHECK (role::text = ANY (ARRAY['admin'::character varying, 'employee'::character va
rying]::text[]))
Referenced by:
    TABLE "assessments" CONSTRAINT "assessments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) O
N DELETE CASCADE
    TABLE "assignments" CONSTRAINT "assignments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) O
N DELETE CASCADE


cybersentinel_db=>