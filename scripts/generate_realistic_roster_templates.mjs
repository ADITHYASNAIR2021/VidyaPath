import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'spreadsheet');
const SCHOOL_NAME = 'VidyaPath Senior Secondary School';
const SCHOOL_CODE = 'VPS001';

const teachers = [
  { name: 'Ananya Rao', email: 'ananya.rao@gmail.com', phone: '9898012101', staffCode: 'TCH-A001' },
  { name: 'Vikram Singh', email: 'vikram.singh@outlook.com', phone: '9898012102', staffCode: 'TCH-A002' },
  { name: 'Meera Joseph', email: 'meera.joseph@gmail.com', phone: '9898012103', staffCode: 'TCH-A003' },
  { name: 'Rohit Kapoor', email: 'rohit.kapoor@yahoo.com', phone: '9898012104', staffCode: 'TCH-A004' },
  { name: 'Sneha Iyer', email: 'sneha.iyer@gmail.com', phone: '9898012105', staffCode: 'TCH-A005' },
  { name: 'Arjun Nair', email: 'arjun.nair@icloud.com', phone: '9898012106', staffCode: 'TCH-A006' },
  { name: 'Pooja Menon', email: 'pooja.menon@gmail.com', phone: '9898012107', staffCode: 'TCH-A007' },
  { name: 'Kabir Khanna', email: 'kabir.khanna@outlook.com', phone: '9898012108', staffCode: 'TCH-A008' },
  { name: 'Neha Sharma', email: 'neha.sharma@gmail.com', phone: '9898012109', staffCode: 'TCH-A009' },
  { name: 'Rahul Verma', email: 'rahul.verma@gmail.com', phone: '9898012110', staffCode: 'TCH-A010' },
  { name: 'Isha Patel', email: 'isha.patel@outlook.com', phone: '9898012111', staffCode: 'TCH-A011' },
  { name: 'Karan Bose', email: 'karan.bose@gmail.com', phone: '9898012112', staffCode: 'TCH-A012' },
  { name: 'Tanvi Chopra', email: 'tanvi.chopra@gmail.com', phone: '9898012113', staffCode: 'TCH-A013' },
  { name: 'Aman Gupta', email: 'aman.gupta@outlook.com', phone: '9898012114', staffCode: 'TCH-A014' },
  { name: 'Divya Mathew', email: 'divya.mathew@gmail.com', phone: '9898012115', staffCode: 'TCH-A015' },
  { name: 'Nikhil Sen', email: 'nikhil.sen@outlook.com', phone: '9898012116', staffCode: 'TCH-A016' },
  { name: 'Ritu Saxena', email: 'ritu.saxena@gmail.com', phone: '9898012117', staffCode: 'TCH-A017' },
  { name: 'Farhan Ali', email: 'farhan.ali@yahoo.com', phone: '9898012118', staffCode: 'TCH-A018' },
  { name: 'Shreya Das', email: 'shreya.das@gmail.com', phone: '9898012119', staffCode: 'TCH-A019' },
  { name: 'Manoj Reddy', email: 'manoj.reddy@outlook.com', phone: '9898012120', staffCode: 'TCH-A020' },
];

const teacherScopes = [
  { teacherEmail: 'ananya.rao@gmail.com', classLevel: 10, subject: 'English Core', section: 'A' },
  { teacherEmail: 'ananya.rao@gmail.com', classLevel: 10, subject: 'English Core', section: 'B' },
  { teacherEmail: 'ananya.rao@gmail.com', classLevel: 10, subject: 'Social Science', section: 'A' },
  { teacherEmail: 'vikram.singh@outlook.com', classLevel: 10, subject: 'Math', section: 'A' },
  { teacherEmail: 'vikram.singh@outlook.com', classLevel: 10, subject: 'Math', section: 'B' },
  { teacherEmail: 'vikram.singh@outlook.com', classLevel: 12, subject: 'Math', section: 'A' },
  { teacherEmail: 'meera.joseph@gmail.com', classLevel: 10, subject: 'Physics', section: 'A' },
  { teacherEmail: 'meera.joseph@gmail.com', classLevel: 10, subject: 'Physics', section: 'B' },
  { teacherEmail: 'meera.joseph@gmail.com', classLevel: 12, subject: 'Physics', section: 'A' },
  { teacherEmail: 'meera.joseph@gmail.com', classLevel: 12, subject: 'Physics', section: 'B' },
  { teacherEmail: 'rohit.kapoor@yahoo.com', classLevel: 10, subject: 'Chemistry', section: 'A' },
  { teacherEmail: 'rohit.kapoor@yahoo.com', classLevel: 10, subject: 'Chemistry', section: 'B' },
  { teacherEmail: 'rohit.kapoor@yahoo.com', classLevel: 12, subject: 'Chemistry', section: 'A' },
  { teacherEmail: 'rohit.kapoor@yahoo.com', classLevel: 12, subject: 'Chemistry', section: 'B' },
  { teacherEmail: 'sneha.iyer@gmail.com', classLevel: 10, subject: 'Biology', section: 'A' },
  { teacherEmail: 'sneha.iyer@gmail.com', classLevel: 10, subject: 'Biology', section: 'B' },
  { teacherEmail: 'sneha.iyer@gmail.com', classLevel: 12, subject: 'Biology', section: 'B' },
  { teacherEmail: 'arjun.nair@icloud.com', classLevel: 12, subject: 'Accountancy', section: 'C' },
  { teacherEmail: 'arjun.nair@icloud.com', classLevel: 12, subject: 'Economics', section: 'C' },
  { teacherEmail: 'pooja.menon@gmail.com', classLevel: 12, subject: 'Business Studies', section: 'C' },
  { teacherEmail: 'pooja.menon@gmail.com', classLevel: 12, subject: 'Economics', section: 'C' },
  { teacherEmail: 'kabir.khanna@outlook.com', classLevel: 10, subject: 'English Core', section: 'C' },
  { teacherEmail: 'kabir.khanna@outlook.com', classLevel: 12, subject: 'English Core', section: 'C' },
  { teacherEmail: 'neha.sharma@gmail.com', classLevel: 10, subject: 'Social Science', section: 'B' },
  { teacherEmail: 'neha.sharma@gmail.com', classLevel: 10, subject: 'Social Science', section: 'C' },
  { teacherEmail: 'neha.sharma@gmail.com', classLevel: 12, subject: 'English Core', section: 'B' },
  { teacherEmail: 'rahul.verma@gmail.com', classLevel: 12, subject: 'Physics', section: 'C' },
  { teacherEmail: 'rahul.verma@gmail.com', classLevel: 12, subject: 'Chemistry', section: 'C' },
  { teacherEmail: 'isha.patel@outlook.com', classLevel: 12, subject: 'Math', section: 'B' },
  { teacherEmail: 'isha.patel@outlook.com', classLevel: 12, subject: 'Physics', section: 'B' },
  { teacherEmail: 'karan.bose@gmail.com', classLevel: 12, subject: 'Chemistry', section: 'B' },
  { teacherEmail: 'karan.bose@gmail.com', classLevel: 10, subject: 'Chemistry', section: 'C' },
  { teacherEmail: 'tanvi.chopra@gmail.com', classLevel: 10, subject: 'Biology', section: 'C' },
  { teacherEmail: 'tanvi.chopra@gmail.com', classLevel: 12, subject: 'Biology', section: 'A' },
  { teacherEmail: 'aman.gupta@outlook.com', classLevel: 12, subject: 'Accountancy', section: 'B' },
  { teacherEmail: 'aman.gupta@outlook.com', classLevel: 12, subject: 'Business Studies', section: 'B' },
  { teacherEmail: 'aman.gupta@outlook.com', classLevel: 12, subject: 'Economics', section: 'B' },
  { teacherEmail: 'divya.mathew@gmail.com', classLevel: 10, subject: 'Math', section: 'C' },
  { teacherEmail: 'divya.mathew@gmail.com', classLevel: 12, subject: 'Math', section: 'C' },
  { teacherEmail: 'nikhil.sen@outlook.com', classLevel: 10, subject: 'English Core', section: 'B' },
  { teacherEmail: 'nikhil.sen@outlook.com', classLevel: 10, subject: 'English Core', section: 'C' },
  { teacherEmail: 'nikhil.sen@outlook.com', classLevel: 12, subject: 'English Core', section: 'A' },
  { teacherEmail: 'ritu.saxena@gmail.com', classLevel: 10, subject: 'Social Science', section: 'A' },
  { teacherEmail: 'ritu.saxena@gmail.com', classLevel: 10, subject: 'Social Science', section: 'B' },
  { teacherEmail: 'ritu.saxena@gmail.com', classLevel: 10, subject: 'Social Science', section: 'C' },
  { teacherEmail: 'farhan.ali@yahoo.com', classLevel: 12, subject: 'Physics', section: 'A' },
  { teacherEmail: 'farhan.ali@yahoo.com', classLevel: 12, subject: 'Chemistry', section: 'A' },
  { teacherEmail: 'farhan.ali@yahoo.com', classLevel: 12, subject: 'Math', section: 'A' },
  { teacherEmail: 'shreya.das@gmail.com', classLevel: 12, subject: 'Biology', section: 'B' },
  { teacherEmail: 'shreya.das@gmail.com', classLevel: 12, subject: 'Biology', section: 'C' },
  { teacherEmail: 'shreya.das@gmail.com', classLevel: 10, subject: 'Biology', section: 'A' },
  { teacherEmail: 'manoj.reddy@outlook.com', classLevel: 10, subject: 'English Core', section: 'A' },
  { teacherEmail: 'manoj.reddy@outlook.com', classLevel: 10, subject: 'Social Science', section: 'A' },
  { teacherEmail: 'manoj.reddy@outlook.com', classLevel: 12, subject: 'Physics', section: 'B' },
  { teacherEmail: 'manoj.reddy@outlook.com', classLevel: 12, subject: 'Chemistry', section: 'B' },
];

const class10Names = [
  'Aarav Bansal', 'Diya Krishnan', 'Ishaan Patil', 'Manya Sharma', 'Rudra Menon',
  'Kavya Nair', 'Pranav Iqbal', 'Siya Kapoor', 'Tanish Rao', 'Zara Joseph',
  'Arnav Sethi', 'Bhavya Singh', 'Charvi Mathew', 'Devansh Gupta', 'Eesha Pillai',
  'Fahad Ali', 'Gauri Sreenivasan', 'Hrithik Das', 'Ira Bhatia', 'Jatin Verghese',
  'Kiara Paul', 'Laksh Menon', 'Mehul Kapoor', 'Navya Iyer', 'Omkar Dutta',
  'Pari Anand', 'Qadir Khan', 'Rhea Thomas', 'Samar Arora', 'Tanisha Bose',
];

const class12Names = [
  'Aditi Mehra', 'Bhuvan Raj', 'Celine Fernandes', 'Daksh Malhotra', 'Esha Rathi', 'Faizan Noor',
  'Gitanjali Nanda', 'Harshad Iyer', 'Ishita Rao', 'Jeevan Kulkarni', 'Khushi Bhagat', 'Lakshay Chopra',
  'Mitali Dey', 'Nakul Shah', 'Oorja Bedi', 'Prisha Nair', 'Qasim Mir', 'Ritika Arora',
  'Sahil Verma', 'Tanaya Pillai', 'Uday Mallick', 'Vaani Kapoor', 'Waseem Ansari', 'Yukti Sen',
  'Ahan Dsouza', 'Barkha Nair', 'Chaitanya Menon', 'Disha Puri', 'Eklavya Bhat', 'Fiona George',
  'Gaurav Jha', 'Hiba Khan', 'Ivaan Sood', 'Jhanvi Roy', 'Kushagra Jain', 'Lavanya Reddy',
];

const class10SubjectPatterns = [
  ['Physics', 'Chemistry', 'Math', 'English Core', 'Social Science'],
  ['Biology', 'Chemistry', 'Math', 'English Core', 'Social Science'],
  ['Physics', 'Biology', 'Math', 'English Core', 'Social Science'],
];

const class12Combos = [
  { section: 'A', stream: 'pcm', subjects: ['Physics', 'Chemistry', 'Math', 'English Core'] },
  { section: 'A', stream: '', subjects: ['Physics', 'Chemistry', 'Math', 'English Core', 'Economics'] },
  { section: 'A', stream: '', subjects: ['Physics', 'Chemistry', 'Math', 'English Core', 'Social Science'] },
  { section: 'B', stream: 'pcb', subjects: ['Physics', 'Chemistry', 'Biology', 'English Core'] },
  { section: 'B', stream: '', subjects: ['Physics', 'Chemistry', 'Biology', 'Math', 'English Core'] },
  { section: 'B', stream: '', subjects: ['Physics', 'Chemistry', 'Biology', 'English Core', 'Economics'] },
  { section: 'C', stream: 'commerce', subjects: ['Accountancy', 'Business Studies', 'Economics', 'English Core'] },
  { section: 'C', stream: '', subjects: ['Accountancy', 'Business Studies', 'Economics', 'Math', 'English Core'] },
  { section: 'C', stream: '', subjects: ['Accountancy', 'Business Studies', 'Economics', 'English Core', 'Social Science'] },
];

function valueToCsv(value) {
  const raw = String(value ?? '');
  const escaped = raw.replaceAll('"', '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

async function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.map(valueToCsv).join(','),
    ...rows.map((row) => headers.map((header) => valueToCsv(row[header] ?? '')).join(',')),
  ];
  await fs.writeFile(filePath, lines.join('\n'), 'utf8');
}

function addSheet(workbook, sheetName, headers, rows) {
  const sheet = workbook.worksheets.add(sheetName);
  const matrix = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))];
  sheet.getRangeByIndexes(0, 0, matrix.length, headers.length).values = matrix;
  sheet.freezePanes.freezeRows(1);
  const headerRange = sheet.getRangeByIndexes(0, 0, 1, headers.length);
  headerRange.format = {
    fill: '#1F2937',
    font: { bold: true, color: '#FFFFFF' },
    horizontalAlignment: 'center',
  };
  return sheet;
}

function buildStudents() {
  const students = [];

  const class10Sections = ['A', 'B', 'C'];
  for (let i = 0; i < class10Names.length; i += 1) {
    const section = class10Sections[Math.floor(i / 10)];
    const serial = String(i + 1).padStart(3, '0');
    const rollNo = `10${section}${serial}`;
    const rollCode = `VPS10${section}${serial}`;
    const subjectSet = class10SubjectPatterns[i % class10SubjectPatterns.length];
    students.push({
      name: class10Names[i],
      rollNo,
      rollCode,
      rollNumber: rollNo,
      classLevel: 10,
      class: 10,
      stream: '',
      section,
      batch: '2028',
      schoolName: SCHOOL_NAME,
      schoolCode: SCHOOL_CODE,
      yearOfEnrollment: i % 2 === 0 ? 2024 : 2025,
      subjects: subjectSet.join(','),
      _subjectsArray: subjectSet,
    });
  }

  for (let i = 0; i < class12Names.length; i += 1) {
    const combo = class12Combos[Math.floor(i / 4)];
    const serial = String(i + 1).padStart(3, '0');
    const rollNo = `12${combo.section}${serial}`;
    const rollCode = `VPS12${combo.section}${serial}`;
    students.push({
      name: class12Names[i],
      rollNo,
      rollCode,
      rollNumber: rollNo,
      classLevel: 12,
      class: 12,
      stream: combo.stream,
      section: combo.section,
      batch: '2026',
      schoolName: SCHOOL_NAME,
      schoolCode: SCHOOL_CODE,
      yearOfEnrollment: i % 3 === 0 ? 2023 : 2024,
      subjects: combo.subjects.join(','),
      _subjectsArray: combo.subjects,
    });
  }

  return students;
}

function buildStudentSubjects(students) {
  const subjectRows = [];
  for (const student of students) {
    for (const subject of student._subjectsArray) {
      subjectRows.push({
        studentRollNo: student.rollNo,
        studentRollCode: student.rollCode,
        studentName: student.name,
        classLevel: student.classLevel,
        section: student.section,
        subject,
        schoolName: student.schoolName,
        schoolCode: student.schoolCode,
      });
    }
  }
  return subjectRows;
}

function buildTeachersSimpleRows() {
  const firstScopeByEmail = new Map();
  for (const scope of teacherScopes) {
    if (!firstScopeByEmail.has(scope.teacherEmail)) {
      firstScopeByEmail.set(scope.teacherEmail, scope);
    }
  }
  return teachers.map((teacher) => {
    const firstScope = firstScopeByEmail.get(teacher.email);
    return {
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone,
      staffCode: teacher.staffCode,
      scopeClassLevel: firstScope?.classLevel ?? '',
      scopeSubject: firstScope?.subject ?? '',
      scopeSection: firstScope?.section ?? '',
      schoolName: SCHOOL_NAME,
      schoolCode: SCHOOL_CODE,
    };
  });
}

function buildAffiliationRows() {
  return [
    {
      schoolName: 'Greenfield test Public School',
      schoolCodeHint: 'GFTEST01',
      board: 'CBSE',
      state: 'Kerala',
      city: 'Kochi',
      affiliationReference: 'CBSE-TEST-1001',
      portalEmail: 'admin1@greenfieldtest.school',
      portalPassword: 'TestSchool@1001',
      contactName: 'Akhil Thomas',
      contactPhone: '9897001001',
      contactEmail: 'akhil.thomas@greenfieldtest.school',
      notes: 'test onboarding submission for school affiliation portal',
    },
    {
      schoolName: 'Sunrise test Senior Secondary School',
      schoolCodeHint: 'SSTEST02',
      board: 'CBSE',
      state: 'Tamil Nadu',
      city: 'Chennai',
      affiliationReference: 'CBSE-TEST-1002',
      portalEmail: 'admin2@sunrisetest.school',
      portalPassword: 'TestSchool@1002',
      contactName: 'Bhavna Iyer',
      contactPhone: '9897001002',
      contactEmail: 'bhavna.iyer@sunrisetest.school',
      notes: 'test payload for school profile verification flow',
    },
    {
      schoolName: 'Riverside test Academy',
      schoolCodeHint: 'RVTEST03',
      board: 'CBSE',
      state: 'Karnataka',
      city: 'Bengaluru',
      affiliationReference: 'CBSE-TEST-1003',
      portalEmail: 'admin3@riversidetest.school',
      portalPassword: 'TestSchool@1003',
      contactName: 'Chirag Rao',
      contactPhone: '9897001003',
      contactEmail: 'chirag.rao@riversidetest.school',
      notes: 'test case with multi-campus branch declaration',
    },
    {
      schoolName: 'Hillside test International School',
      schoolCodeHint: 'HLTEST04',
      board: 'CBSE',
      state: 'Maharashtra',
      city: 'Pune',
      affiliationReference: 'CBSE-TEST-1004',
      portalEmail: 'admin4@hillsidetest.school',
      portalPassword: 'TestSchool@1004',
      contactName: 'Divya Shah',
      contactPhone: '9897001004',
      contactEmail: 'divya.shah@hillsidetest.school',
      notes: 'test profile for affiliation rejection/re-submit workflow',
    },
    {
      schoolName: 'Lotus test Vidyalaya',
      schoolCodeHint: 'LTTEST05',
      board: 'CBSE',
      state: 'Delhi',
      city: 'New Delhi',
      affiliationReference: 'CBSE-TEST-1005',
      portalEmail: 'admin5@lotustest.school',
      portalPassword: 'TestSchool@1005',
      contactName: 'Eshan Kapoor',
      contactPhone: '9897001005',
      contactEmail: 'eshan.kapoor@lotustest.school',
      notes: 'test record for final approval queue simulation',
    },
  ];
}

async function exportWorkbook(filePath, sheetPayloads) {
  const workbook = Workbook.create();
  for (const payload of sheetPayloads) {
    addSheet(workbook, payload.sheetName, payload.headers, payload.rows);
  }
  const out = await SpreadsheetFile.exportXlsx(workbook);
  await out.save(filePath);
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const students = buildStudents();
  const studentSubjects = buildStudentSubjects(students);
  const teachersSimpleRows = buildTeachersSimpleRows();
  const teacherScopeRows = teacherScopes.map((scope) => ({
    ...scope,
    schoolName: SCHOOL_NAME,
    schoolCode: SCHOOL_CODE,
  }));
  const affiliationRows = buildAffiliationRows();
  const schoolsRows = [{ schoolName: SCHOOL_NAME, schoolCode: SCHOOL_CODE }];

  const teacherHeaders = ['name', 'email', 'phone', 'staffCode', 'scopeClassLevel', 'scopeSubject', 'scopeSection', 'schoolName', 'schoolCode'];
  const teacherScopeHeaders = ['teacherEmail', 'classLevel', 'subject', 'section', 'schoolName', 'schoolCode'];
  const studentHeaders = ['name', 'rollNo', 'rollCode', 'rollNumber', 'classLevel', 'class', 'stream', 'section', 'batch', 'schoolName', 'schoolCode', 'subjects', 'yearOfEnrollment'];
  const studentSubjectHeaders = ['studentRollNo', 'studentRollCode', 'studentName', 'classLevel', 'section', 'subject', 'schoolName', 'schoolCode'];
  const schoolHeaders = ['schoolName', 'schoolCode'];
  const affiliationHeaders = ['schoolName', 'schoolCodeHint', 'board', 'state', 'city', 'affiliationReference', 'portalEmail', 'portalPassword', 'contactName', 'contactPhone', 'contactEmail', 'notes'];

  await writeCsv(path.join(OUTPUT_DIR, 'teachers_import_template.csv'), teacherHeaders, teachersSimpleRows);
  await writeCsv(path.join(OUTPUT_DIR, 'teacher_scopes_template.csv'), teacherScopeHeaders, teacherScopeRows);
  await writeCsv(path.join(OUTPUT_DIR, 'students_import_template.csv'), studentHeaders, students);
  await writeCsv(path.join(OUTPUT_DIR, 'student_subjects_template.csv'), studentSubjectHeaders, studentSubjects);
  await writeCsv(path.join(OUTPUT_DIR, 'school_affiliation_test_credentials.csv'), affiliationHeaders, affiliationRows);

  await exportWorkbook(path.join(OUTPUT_DIR, 'teachers_import_template.xlsx'), [
    { sheetName: 'Teachers', headers: teacherHeaders, rows: teachersSimpleRows },
    { sheetName: 'TeacherScopes', headers: teacherScopeHeaders, rows: teacherScopeRows },
    { sheetName: 'Schools', headers: schoolHeaders, rows: schoolsRows },
  ]);

  await exportWorkbook(path.join(OUTPUT_DIR, 'students_import_template.xlsx'), [
    { sheetName: 'Students', headers: studentHeaders, rows: students },
    { sheetName: 'StudentSubjects', headers: studentSubjectHeaders, rows: studentSubjects },
    { sheetName: 'Schools', headers: schoolHeaders, rows: schoolsRows },
  ]);

  await exportWorkbook(path.join(OUTPUT_DIR, 'roster_import_relational.xlsx'), [
    { sheetName: 'Teachers', headers: teacherHeaders, rows: teachersSimpleRows },
    { sheetName: 'TeacherScopes', headers: teacherScopeHeaders, rows: teacherScopeRows },
    { sheetName: 'Students', headers: studentHeaders, rows: students },
    { sheetName: 'StudentSubjects', headers: studentSubjectHeaders, rows: studentSubjects },
    { sheetName: 'Schools', headers: schoolHeaders, rows: schoolsRows },
  ]);

  await exportWorkbook(path.join(OUTPUT_DIR, 'school_affiliation_test_credentials.xlsx'), [
    { sheetName: 'AffiliationTestCredentials', headers: affiliationHeaders, rows: affiliationRows },
  ]);

  console.log(JSON.stringify({
    outputDir: OUTPUT_DIR,
    totals: {
      teachers: teachers.length,
      teacherScopes: teacherScopeRows.length,
      students: students.length,
      studentSubjects: studentSubjects.length,
      affiliationRows: affiliationRows.length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
