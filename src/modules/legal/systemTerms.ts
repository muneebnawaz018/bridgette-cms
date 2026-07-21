/**
 * System Terms & Policies — the rules for using the Bridgette Portal itself: accounts, access,
 * acceptable use, security, and the data held in it. This is the document the app footer links
 * to. It is about the *software*, not about any invoice — billing terms live separately in
 * `modules/invoicing/terms`.
 *
 * A professional template. Clause numbers run in one sequence across all sections. Have it
 * reviewed by qualified counsel before relying on it as a binding agreement.
 */
import { COMPANY, PORTAL_NAME } from './company';
import type { LegalDoc } from './types';

export const SYSTEM_TERMS: LegalDoc = {
  title: 'Terms & Policies',
  subtitle: `How the ${PORTAL_NAME} may be used, and the rules that apply to every account.`,
  company: COMPANY,
  effective: 'Effective 1 January 2026',
  intro: `These Terms & Policies govern access to and use of the ${PORTAL_NAME} ("the Portal"), the internal management system operated by ${COMPANY} ("we", "us", "our"). They apply to everyone granted an account. By signing in and using the Portal you agree to them. If you do not agree, do not use the Portal.`,
  sections: [
    {
      title: '1. Definitions',
      clauses: [
        {
          heading: '1.1 Key terms',
          paragraphs: [
            `"Portal" means the ${PORTAL_NAME} application and its features. "User" means any person given an account. "Administrator" means a user with elevated rights to manage other accounts and settings. "Content" means the data entered into or generated within the Portal, including invoices, client details, and payment records.`,
          ],
        },
      ],
    },
    {
      title: '2. The Portal',
      clauses: [
        {
          heading: '2.1 What the Portal is for',
          paragraphs: [
            `The Portal is an internal tool for authorised staff to create and manage invoices, record payments, and administer users. It is provided for the operation of the business and is not a public service.`,
          ],
        },
        {
          heading: '2.2 Eligibility & authorisation',
          paragraphs: [
            `Access is granted at our discretion to individuals an Administrator invites. It is tied to your role and remains a privilege we may vary or withdraw. You may use the Portal only while you are authorised to do so.`,
          ],
        },
      ],
    },
    {
      title: '3. Accounts & Access',
      clauses: [
        {
          heading: '3.1 Your account',
          paragraphs: [
            `Your account is personal to you. You are responsible for everything done under it. Credentials must not be shared, transferred, or used by anyone else, and you must not use an account that is not your own.`,
          ],
        },
        {
          heading: '3.2 Roles & permissions',
          paragraphs: [
            `What you can see and do is determined by the role assigned to your account. You must not attempt to access data or perform actions beyond the permissions granted to you, or to circumvent the Portal's access controls.`,
          ],
        },
        {
          heading: '3.3 Keeping your details current',
          paragraphs: [
            `Keep the email address and contact details on your account accurate. Security notices, password resets, and reminders are sent to them, and out-of-date details can lock you out or misdirect confidential information.`,
          ],
        },
      ],
    },
    {
      title: '4. Acceptable Use',
      clauses: [
        {
          heading: '4.1 Permitted use',
          paragraphs: [
            `Use the Portal only for legitimate business purposes and in line with your role and any instructions from an Administrator. Handle the Content in it with the same care you would any confidential company record.`,
          ],
        },
        {
          heading: '4.2 Prohibited conduct',
          paragraphs: [
            `You must not: attempt to gain unauthorised access to any account, data, or system; probe, scan, or test the security of the Portal without permission; copy, scrape, or extract data in bulk beyond your legitimate work; reverse engineer or tamper with the software; upload malware or harmful code; or interfere with the Portal's normal operation for other users.`,
          ],
        },
      ],
    },
    {
      title: '5. Security',
      clauses: [
        {
          heading: '5.1 Passwords & credentials',
          paragraphs: [
            `Choose a strong, unique password and keep it secret. Do not reuse it on other services or write it where others can find it. We may enforce password strength, expiry, and reset requirements to protect the Portal.`,
          ],
        },
        {
          heading: '5.2 Sessions & devices',
          paragraphs: [
            `Sign out when you finish on a shared or public device, and do not leave an authenticated session unattended. You are responsible for activity from a session you leave open.`,
          ],
        },
        {
          heading: '5.3 Reporting incidents',
          paragraphs: [
            `Report any suspected compromise of your account, lost device, or security concern to an Administrator without delay. Prompt reporting limits the damage a compromised account can do.`,
          ],
        },
      ],
    },
    {
      title: '6. Data & Privacy',
      clauses: [
        {
          heading: '6.1 Content you enter',
          paragraphs: [
            `You are responsible for the accuracy of the Content you enter and for having a lawful basis to hold any personal data of clients or third parties you add to the Portal, such as names, emails, and addresses.`,
          ],
        },
        {
          heading: '6.2 How we use Portal data',
          paragraphs: [
            `We process the Content to operate the Portal, keep business records, and meet legal and accounting obligations. We do not sell it. Access is limited to users whose role requires it.`,
          ],
        },
        {
          heading: '6.3 Logging, audit & retention',
          paragraphs: [
            `Actions in the Portal — such as creating, editing, archiving, or deleting records — may be logged with the account and time for security and audit. Records and logs are retained for as long as legal and legitimate business needs require, then deleted or anonymised.`,
          ],
        },
      ],
    },
    {
      title: '7. Availability & Support',
      clauses: [
        {
          heading: '7.1 Availability',
          paragraphs: [
            `The Portal is provided on an "as available" basis. It may be unavailable during maintenance, updates, or events beyond our control. We do not guarantee uninterrupted or error-free operation.`,
          ],
        },
        {
          heading: '7.2 Changes to the Portal',
          paragraphs: [
            `We may add, change, or remove features at any time to improve, secure, or maintain the Portal. Where a change materially affects how you work, we aim to give reasonable notice through the usual channels.`,
          ],
        },
        {
          heading: '7.3 Support',
          paragraphs: [
            `Support is provided through Administrators and the usual internal channels. Report faults and access problems there so they can be triaged and, where needed, escalated.`,
          ],
        },
      ],
    },
    {
      title: '8. Intellectual Property',
      clauses: [
        {
          heading: '8.1 Ownership',
          paragraphs: [
            `The Portal software, its design, layout, and any related trademarks and branding belong to us or our licensors. Your access grants you no ownership of, or licence to, the software beyond the right to use it as permitted here.`,
          ],
        },
        {
          heading: '8.2 Restrictions',
          paragraphs: [
            `You must not copy, modify, distribute, sell, sublicense, or create derivative works from the Portal software, or remove any proprietary notices, except where the law expressly allows it despite this restriction.`,
          ],
        },
      ],
    },
    {
      title: '9. Confidentiality',
      clauses: [
        {
          heading: '9.1 Confidential information',
          paragraphs: [
            `Content in the Portal, including client details, pricing, and payment records, is confidential company information. Do not disclose it, or take copies of it, outside what your authorised work requires. Confidentiality obligations continue after your access ends.`,
          ],
        },
      ],
    },
    {
      title: '10. Liability & Disclaimers',
      clauses: [
        {
          heading: '10.1 Disclaimer',
          paragraphs: [
            `Except as expressly stated here and as required by law, the Portal is provided without warranties of any kind, whether express or implied, including fitness for a particular purpose and uninterrupted availability.`,
          ],
        },
        {
          heading: '10.2 Limitation of liability',
          paragraphs: [
            `To the fullest extent permitted by law, we are not liable for indirect, incidental, or consequential loss arising from use of, or inability to use, the Portal, including lost profit, revenue, data, or business. Nothing here excludes liability that cannot be excluded by law.`,
          ],
        },
      ],
    },
    {
      title: '11. Suspension & Termination',
      clauses: [
        {
          heading: '11.1 Suspension & closure of access',
          paragraphs: [
            `We may suspend or revoke your access at any time — for example on a change of role, when you leave the organisation, during a security concern, or on breach of these terms. Where practical we give notice, but we may act immediately to protect the Portal or its data.`,
          ],
        },
        {
          heading: '11.2 Effect of closure',
          paragraphs: [
            `When your access ends you lose the ability to sign in. The Content you created remains the property and record of the business and is retained under section 6.`,
          ],
        },
      ],
    },
    {
      title: '12. General',
      clauses: [
        {
          heading: '12.1 Changes to these terms',
          paragraphs: [
            `We may update these terms from time to time. Continued use of the Portal after a change takes effect is acceptance of the updated terms. Material changes are communicated through the usual account channels.`,
          ],
        },
        {
          heading: '12.2 Governing law',
          paragraphs: [
            `These terms are governed by the laws of the jurisdiction in which ${COMPANY} is registered, and the parties submit to the exclusive jurisdiction of its courts, without regard to conflict-of-laws principles.`,
          ],
        },
        {
          heading: '12.3 Severability & waiver',
          paragraphs: [
            `If any provision is found unenforceable, the rest remain in force. A failure to enforce a provision is not a waiver of the right to enforce it later.`,
          ],
        },
      ],
    },
  ],
};
