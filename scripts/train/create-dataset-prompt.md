Role: Act as a Senior Research Engineer specializing in Form-Understanding AI and Synthetic Data Generation.

Task: Generate a highly realistic, "noisy" training dataset for a web form field classifier. The data must mimic real-world DOM attributes found in modern ATS platforms (Workday, Greenhouse, Lever), E-commerce sites, and Legacy Enterprise systems.

Output Requirement: Output ONLY a valid JSON array. Do not provide any conversational text, explanations, or markdown code blocks (unless necessary for the JSON).

1. DATA SCHEMA
Each object in the array MUST follow this exact structure:

JSON

{
  "features": {
    "label": "Visible text (e.g., 'First Name *', 'Vorname', 'Search')",
    "name": "HTML name/id (e.g., 'fname', 'input_29', 'wd-Candidate-Name')",
    "automationId": "Data attributes like 'data-qa', 'data-automation-id', 'test-id' (or null)",
    "placeholder": "Ghost text (e.g., 'Enter name...', 'MM/YYYY') (or null)",
    "parentContext": "Header of the section (e.g., 'Payment', 'Education', 'Personal Info')",
    "siblingContext": "Helper text/hints (e.g., 'Required', 'Visible to recruiters')"
  },
  "label": "EXACT_CLASS_NAME"
}
2. GENERATION STRATEGY
Framework Noise: Use ids like ember492 (Ember), react-select-2 (React), wd-Input (Workday), and ctl00_Body (ASP.NET).

Linguistic Diversity: Use English, Spanish, French, and German labels randomly.

Ambiguity Resolution: Ensure parentContext clarifies generic labels (e.g., label "Name" inside parent "University" = school_name).

Label Noise: Include asterisks (*), colons (:), and instructions in the label.

3. TARGET TAXONOMY
Generate 3 distinct, high-quality samples for EVERY class in this list:

[unknown, first_name, middle_name, last_name, full_name, preferred_name, headline, summary, profile_photo, email, email_secondary, phone, phone_mobile, phone_home, linkedin_url, github_url, portfolio_url, website_url, twitter_url, facebook_url, instagram_url, google_scholar_url, other_url, address_line_1, address_line_2, city, state, zip_code, country, current_location, timezone, relocation, preferred_location, job_title, current_title, employer_name, current_company, job_start_date, job_end_date, job_current, job_description, job_location, years_experience, industry, department, institution_name, school_name, degree_type, field_of_study, major, minor, gpa, graduation_date, education_start_date, education_end_date, education_current, honors, education_level, skills, technical_skills, certifications, licenses, languages, language_proficiency, years_skill, skill_level, reference_name, reference_email, reference_phone, reference_relationship, gender, gender_identity, pronouns, race, ethnicity, veteran, disability, marital_status, salary_current, salary_expected, salary_minimum, salary_currency, bonus_expected, equity_expected, start_date, availability, notice_period, work_type, shift_preference, travel_percentage, remote_preference, job_type_preference, work_style, communication_style, career_goals, desired_role, interest_areas, work_auth, sponsorship, visa_status, citizenship, clearance, clearance_active, legal_age, tax_id, date_of_birth, background_check, criminal_record, drug_test, military_service, service_dates, discharge_status, federal_employee, federal_grade, schedule_a, publications, patents, research_interests, thesis_title, advisor_name, referral_source, referrer_name, referrer_email, employee_id, job_id, requisition_id, application_date, resume_filename, cover_letter, additional_info, notes, intro_note, custom_question, generic_question, agreement]

4. EXECUTION
Generate the JSON array now. Ensure strict JSON validity.