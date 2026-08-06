import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — OpenParsed',
};

export default function PrivacyPage() {
  return (
    <div className="flex-1 bg-[#0a0a0f] text-white px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-gray-400 text-sm hover:text-gray-200 transition-colors">
          ← Back to OpenParsed
        </Link>

        <h1 className="text-3xl font-bold mt-8 mb-2">Privacy Policy</h1>
        <p className="text-gray-400 text-sm mb-12">Last updated: August 2026</p>

        <div className="space-y-8 text-gray-300 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-semibold text-base mb-2">What we collect</h2>
            <p>
              Your uploaded PDF is stored on our servers to process your request. We do not require
              an account or collect your name. We log basic request metadata (IP address, timestamp,
              file size) for security purposes.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">How we use it</h2>
            <p>
              Your file is used only to extract transactions and return them as a CSV. We do not
              read, sell, or share your bank statement with anyone.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">Data retention</h2>
            <p>
              All uploaded files and extracted data are automatically deleted after{' '}
              <strong className="text-white">7 days</strong>. Want it removed sooner? Email us
              and we will delete it within 24 hours.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">Analytics</h2>
            <p>
              We use <strong className="text-white">PostHog</strong> for anonymous usage analytics
              (page views, feature usage). No financial data from your statement is shared with PostHog.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-2">Contact</h2>
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
