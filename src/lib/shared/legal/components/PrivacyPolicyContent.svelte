<script lang="ts">
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";

  /**
   * The privacy policy body: the Quick Summary and the twelve sections. The
   * /privacy page and the footer's privacy sheet both render this, so the two
   * can never disagree. Do not reword it without Austen seeing the new text.
   *
   * On the page the sections are h2 with ids (so /privacy#messages works).
   * In the sheet, whose title is the h2, they are h3 and carry no ids, so an
   * id never appears twice in one document.
   */
  interface Props {
    inSheet?: boolean;
  }

  let { inSheet = false }: Props = $props();

  const sectionTag = $derived(inSheet ? "h3" : "h2");
  const subTag = $derived(inSheet ? "h4" : "h3");

  function anchor(id: string): string | undefined {
    return inSheet ? undefined : id;
  }
</script>

<div class="policy" class:in-sheet={inSheet}>
  <!-- Summary Box -->
  <div class="summary-box">
    <svelte:element this={sectionTag} class="summary-title"
      >Quick Summary</svelte:element
    >
    <p>
      Flow Arts Composer and The Kinetic Alphabet are operated by Austen Cloud.
    </p>
    <ul>
      <li>
        Flow Arts Composer collects only what's needed to provide the service
      </li>
      <li>Your data is stored on Firebase servers (US and other regions)</li>
      <li>Your data is never sold or used for ML training</li>
      <li>You can export or delete your data anytime</li>
      <li>
        Questions? Email <LinkChip
          size="inline"
          href="mailto:tkaflowarts@gmail.com">tkaflowarts@gmail.com</LinkChip
        >
      </li>
    </ul>
  </div>

  <section id={anchor("information-collected")}>
    <svelte:element this={sectionTag} class="sec-h"
      >1. Information Collected</svelte:element
    >
    <p>
      When you use Flow Arts Composer, the following types of information are
      collected:
    </p>
    <ul>
      <li>
        <strong>Account Information:</strong> Email address and display name when
        you create an account. If you choose Instagram sign-in, TKA stores your Instagram
        account ID, username, and professional account type. TKA does not store your
        Instagram access token.
      </li>
      <li>
        <strong>Usage Data:</strong> How you interact with the application, including
        sequences you create and features you use
      </li>
      <li>
        <strong>Device Information:</strong> Browser type, device type, and operating
        system for optimization purposes
      </li>
      <li>
        <strong>Messages:</strong> Content of messages you send to other users through
        the in-app messaging feature
      </li>
    </ul>
  </section>

  <section id={anchor("information-use")}>
    <svelte:element this={sectionTag} class="sec-h"
      >2. How Your Information Is Used</svelte:element
    >
    <p>The information collected is used to:</p>
    <ul>
      <li>Provide and maintain the Flow Arts Composer service</li>
      <li>Personalize your experience and save your preferences</li>
      <li>Enable community features like sharing sequences</li>
      <li>Improve and optimize the application</li>
      <li>Communicate important updates about the service</li>
    </ul>
  </section>

  <section id={anchor("data-storage")}>
    <svelte:element this={sectionTag} class="sec-h"
      >3. Data Storage and Security</svelte:element
    >
    <p>
      Your data is stored securely using <LinkChip
        size="inline"
        href="https://firebase.google.com/support/privacy">Firebase</LinkChip
      > services, including:
    </p>
    <ul>
      <li>
        <strong>Firebase Authentication:</strong> Handles sign-in and account security
      </li>
      <li>
        <strong>Cloud Firestore:</strong> Stores your sequences, settings, and profile
      </li>
      <li>
        <strong>Firebase Storage:</strong> Stores any uploaded images or media
      </li>
    </ul>
    <p>
      Your data may be stored on servers in the United States and other
      countries where Google operates data centers. Appropriate technical and
      organizational measures are in place to protect your personal information
      against unauthorized access, alteration, disclosure, or destruction.
    </p>
  </section>

  <section id={anchor("messages")}>
    <svelte:element this={sectionTag} class="sec-h"
      >4. Messages and Communications</svelte:element
    >
    <p>
      When you use the messaging feature to communicate with other users, your
      messages are stored to deliver them and maintain your conversation
      history.
    </p>
    <p>
      <strong>When messages may be reviewed:</strong> Messages may be reviewed by
      the developer only to respond to abuse reports or to provide support when you
      contact Flow Arts Composer about a conversation issue.
    </p>
    <p>
      <strong>Your messages are not:</strong> Sold, shared with third parties, or
      used for machine learning training. Your conversations are not used to train
      AI models.
    </p>
  </section>

  <section id={anchor("data-sharing")}>
    <svelte:element this={sectionTag} class="sec-h"
      >5. Data Sharing</svelte:element
    >
    <p>
      Your personal information is never sold. Data may be shared only in the
      following circumstances:
    </p>
    <ul>
      <li>With your consent when you choose to share sequences publicly</li>
      <li>
        With Firebase/Google as the infrastructure provider (see their <LinkChip
          size="inline"
          href="https://firebase.google.com/support/privacy"
          >privacy policy</LinkChip
        >)
      </li>
      <li>
        With Meta when you choose Instagram or Facebook sign-in. Meta receives
        the information needed to authorize that sign-in.
      </li>
      <li>When required by law or to protect legal rights</li>
    </ul>
  </section>

  <section id={anchor("your-rights")}>
    <svelte:element this={sectionTag} class="sec-h"
      >6. Your Rights</svelte:element
    >

    <svelte:element this={subTag} class="sub-h">All Users</svelte:element>
    <p>You have the right to:</p>
    <ul>
      <li>Access the personal information held about you</li>
      <li>Request correction of inaccurate information</li>
      <li>Request deletion of your account and associated data</li>
      <li>Export your sequences and content</li>
    </ul>
    <p>
      To delete your account, visit the <LinkChip
        size="inline"
        href="/delete-account">account deletion page</LinkChip
      >.
    </p>
    <p>
      You can also submit a data deletion request from Instagram's authorized
      apps settings. TKA removes the Instagram account ID, username, account
      type, and connection record. If Instagram is your only sign-in method, the
      request deletes your TKA account because it would no longer have a usable
      login.
    </p>

    <svelte:element this={subTag} class="sub-h">EU Users (GDPR)</svelte:element>
    <p>If you're in the European Union, you additionally have the right to:</p>
    <ul>
      <li>Object to processing of your personal data</li>
      <li>
        Request data portability (receive your data in a structured format)
      </li>
      <li>Lodge a complaint with your local data protection authority</li>
    </ul>

    <svelte:element this={subTag} class="sub-h"
      >California Users (CCPA)</svelte:element
    >
    <p>
      Flow Arts Composer is a small independent project that falls below CCPA
      revenue thresholds. However, California users are afforded the same
      rights: you can request to know what data is held, request deletion, and
      will not face discrimination for exercising these rights.
    </p>
  </section>

  <section id={anchor("data-retention")}>
    <svelte:element this={sectionTag} class="sec-h"
      >7. Data Retention</svelte:element
    >
    <p>
      Your data is retained for as long as your account is active. When you
      delete your account:
    </p>
    <ul>
      <li>Your profile, sequences, and settings are deleted immediately</li>
      <li>
        Backup data may persist for up to 30 days before being permanently
        removed
      </li>
      <li>Anonymized usage statistics may be retained indefinitely</li>
    </ul>
    <p>
      To delete your account and all associated data, visit the <LinkChip
        size="inline"
        href="/delete-account">account deletion page</LinkChip
      >.
    </p>
    <p>
      When you delete your account, a minimal record is kept for 12 months: your
      name, email, the deletion date, and any reason you choose to provide. This
      record exists solely to document and audit the deletion itself, as
      required under data protection law. After 12 months it is permanently
      removed.
    </p>
  </section>

  <section id={anchor("cookies")}>
    <svelte:element this={sectionTag} class="sec-h"
      >8. Cookies and Local Storage</svelte:element
    >
    <p>
      Flow Arts Composer uses local storage and cookies to maintain your session
      and remember your preferences. These are essential for the application to
      function properly. Cookies are not used for advertising or cross-site
      tracking.
    </p>
  </section>

  <section id={anchor("third-party")}>
    <svelte:element this={sectionTag} class="sec-h"
      >9. Third-Party Services</svelte:element
    >
    <p>Flow Arts Composer uses the following third-party services:</p>
    <ul>
      <li>
        <strong>Firebase:</strong> Authentication, database, and storage (<LinkChip
          size="inline"
          href="https://firebase.google.com/support/privacy"
          >privacy policy</LinkChip
        >)
      </li>
      <li>
        <strong>PostHog:</strong> Usage analytics and session recordings used to understand
        how TKA is used and diagnose problems. Signed-in activity may be linked to
        your account. Text entered into forms is masked before a recording is sent.
        You can block tracking through browser privacy controls or an ad blocker.
      </li>
      <li>
        <strong>Meta:</strong> Optional Instagram and Facebook account authorization.
        Instagram sign-in is available only for creator and business accounts.
      </li>
    </ul>
  </section>

  <section id={anchor("childrens-privacy")}>
    <svelte:element this={sectionTag} class="sec-h"
      >10. Children's Privacy</svelte:element
    >
    <p>
      Flow Arts Composer is not intended for children under 13 years of age.
      Personal information is not knowingly collected from children under 13. If
      you believe a child has provided personal information, please get in touch
      so it can be deleted.
    </p>
  </section>

  <section id={anchor("changes")}>
    <svelte:element this={sectionTag} class="sec-h"
      >11. Changes to This Policy</svelte:element
    >
    <p>
      This Privacy Policy may be updated from time to time. Changes will be
      posted on this page with an updated "Last Updated" date.
    </p>
  </section>

  <section id={anchor("contact")}>
    <svelte:element this={sectionTag} class="sec-h">12. Contact</svelte:element>
    <p>
      For questions about this Privacy Policy or your data, email
      <LinkChip size="inline" href="mailto:tkaflowarts@gmail.com"
        >tkaflowarts@gmail.com</LinkChip
      >.
    </p>
  </section>
</div>

<style>
  .policy {
    display: contents;
  }

  /* Summary box (privacy-only) */
  .summary-box {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(129, 140, 248, 0.3);
    border-radius: 12px;
    padding: 1.25rem;
    margin-bottom: 2rem;
  }

  .summary-box .summary-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: #818cf8;
  }

  /* .policy keeps the box's own list sizing ahead of the sheet's list rule. */
  .policy .summary-box ul {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.9rem;
  }

  .policy .summary-box li {
    margin-bottom: 0.375rem;
  }

  /* Sub-headings under "Your Rights" (the page's h3, the sheet's h4) */
  .sub-h {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 1.25rem 0 0.5rem 0;
    color: #ffffff;
  }

  li strong {
    color: #ffffff;
  }

  /* In the sheet, section headings are h3 and take the sheet's own h3 rule,
     the same one the terms summary uses. The sub-headings sit one step
     below them. */
  .in-sheet .sub-h {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: #fff;
    margin: 16px 0 8px 0;
  }
</style>
