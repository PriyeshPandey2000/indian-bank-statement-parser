import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — OpenParsed',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-gray-400 text-sm hover:text-gray-200 transition-colors">
          ← Back to OpenParsed
        </Link>

        <h1 className="text-3xl font-bold mt-8 mb-2">Privacy Policy</h1>
        <p className="text-gray-400 text-sm mb-12">Last updated: August 2026</p>

        <div className="space-y-10 text-gray-300 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-semibold text-base mb-3">What we collect</h2>
            <p>
              When you upload a bank statement PDF, the file is stored on our servers solely to process
              your request. We do not require an account or collect your name. We also log basic
              request metadata (IP address, timestamp, file size) for security and abuse prevention.
              This metadata is retained for up to 7 days and then deleted along with your uploaded file.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">How we use your data</h2>
            <p>
              Your uploaded file is used only to extract transaction data and return it to you as a
              CSV. We do not read, sell, share, or use the contents of your bank statement for any
              other purpose. No third party sees your financial data.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">Data retention</h2>
            <p>
              Uploaded files and extracted data are automatically deleted from our servers after
              <strong className="text-white"> 7 days</strong>. We do not retain any copies after deletion.
              If you want your data removed sooner, email us and we will delete it immediately.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">Third-party services</h2>
            <p>
              We use <strong className="text-white">PostHog</strong> for anonymous product analytics
              (page views, feature usage). PostHog may set cookies. No financial data from your
              statement is sent to PostHog. We do not use Google Analytics or any advertising
              trackers.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">Security</h2>
            <p>
              All data is transmitted over HTTPS. Files are stored on servers located in Germany
              (Hetzner Cloud). We take reasonable measures to prevent unauthorised access, but no
              internet transmission is 100% secure. Do not upload statements if you are not
              comfortable with this.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">Your rights</h2>
            <p>
              You may request deletion of your data at any time by emailing us with the document
              ID shown in your browser URL. We will delete the associated files within 24 hours.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">Contact</h2>
            <p>
              Questions or deletion requests:{' '}
              <a
                href="mailto:priyeshpandey2000@gmail.com"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                priyeshpandey2000@gmail.com
              </a>
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
