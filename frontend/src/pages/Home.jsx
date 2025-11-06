import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { can } from "../lib/permissions";

function Card({ to, title, desc }) {
  return (
    <Link
      to={to}
      className="group block rounded-2xl bg-white p-6 shadow-sm hover:shadow-md transition"
    >
      <div className="text-lg font-semibold group-hover:underline">{title}</div>
      <p className="text-sm text-gray-600 mt-1">{desc}</p>
    </Link>
  );
}

/* --- Footer (converted to React + Tailwind) --- */
function IconPhone(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className="w-4 h-4 inline -mt-1"
      {...props}
    >
      <path
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 3.75c0-1.243 1.007-2.25 2.25-2.25h2.25A2.25 2.25 0 0 1 9 3.75v1.5A2.25 2.25 0 0 1 6.75 7.5H6c0 6.213 5.037 11.25 11.25 11.25v-.75A2.25 2.25 0 0 1 19.5 15h1.5A2.25 2.25 0 0 1 23.25 17.25v2.25a2.25 2.25 0 0 1-2.25 2.25H18C9.163 21.75 2.25 14.837 2.25 6V3.75Z"
      />
    </svg>
  );
}
function IconMail(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className="w-4 h-4 inline -mt-1"
      {...props}
    >
      <path
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7.5 12 13.5 21 7.5M4.5 6h15A1.5 1.5 0 0 1 21 7.5v9A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5v-9A1.5 1.5 0 0 1 4.5 6Z"
      />
    </svg>
  );
}
function IconLinkedIn(props) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" {...props}>
      <path d="M20.45 20.45h-3.56v-5.41c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85v5.51H9.45V9h3.42v1.56h.05c.48-.9 1.66-1.85 3.42-1.85 3.66 0 4.33 2.41 4.33 5.54v6.2ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.12 20.45H3.56V9h3.56v11.45Z" />
    </svg>
  );
}
function IconFacebook(props) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" {...props}>
      <path d="M22 12.06C22 6.55 17.52 2.08 12 2.08S2 6.55 2 12.06c0 4.98 3.66 9.11 8.45 9.88v-6.99H7.9v-2.89h2.55V9.79c0-2.52 1.5-3.91 3.8-3.91 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.89h-2.34v6.99C18.34 21.17 22 17.04 22 12.06Z" />
    </svg>
  );
}
function IconInstagram(props) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" {...props}>
      <path d="M12 2.2c3 0 3.36.01 4.55.07 1.17.05 1.97.24 2.67.5.72.28 1.33.66 1.92 1.25.59.59.97 1.2 1.25 1.92.26.7.45 1.5.5 2.67.06 1.19.07 1.55.07 4.55s-.01 3.36-.07 4.55c-.05 1.17-.24 1.97-.5 2.67a5.16 5.16 0 0 1-1.25 1.92 5.16 5.16 0 0 1-1.92 1.25c-.7.26-1.5.45-2.67.5-1.19.06-1.55.07-4.55.07s-3.36-.01-4.55-.07c-1.17-.05-1.97-.24-2.67-.5A5.16 5.16 0 0 1 2.82 20.6a5.16 5.16 0 0 1-1.25-1.92c-.26-.7-.45-1.5-.5-2.67C1.01 14.82 1 14.46 1 11.46s.01-3.36.07-4.55c.05-1.17.24-1.97.5-2.67.28-.72.66-1.33 1.25-1.92.59-.59 1.2-.97 1.92-1.25.7-.26 1.5-.45 2.67-.5C8.64 2.21 9 2.2 12 2.2Zm0 1.8c-2.95 0-3.3.01-4.46.07-.96.04-1.49.2-1.84.33-.46.18-.78.39-1.13.74-.35.35-.56.67-.74 1.13-.13.35-.3.88-.33 1.84-.06 1.16-.07 1.51-.07 4.46s.01 3.3.07 4.46c.04.96.2 1.49.33 1.84.18.46.39.78.74 1.13.35.35.67.56 1.13.74.35.13.88.3 1.84.33 1.16.06 1.51.07 4.46.07s3.3-.01 4.46-.07c.96-.04 1.49-.2 1.84-.33.46-.18.78-.39 1.13-.74.35-.35.56-.67.74-1.13.13-.35.3-.88.33-1.84.06-1.16.07-1.51.07-4.46s-.01-3.3-.07-4.46c-.04-.96-.2-1.49-.33-1.84-.18-.46-.39-.78-.74-1.13-.35-.35-.67-.56-1.13-.74-.35-.13-.88-.3-1.84-.33-1.16-.06-1.51-.07-4.46-.07Zm0 3.45a4.85 4.85 0 1 1 0 9.7 4.85 4.85 0 0 1 0-9.7Zm0 1.8a3.05 3.05 0 1 0 0 6.1 3.05 3.05 0 0 0 0-6.1ZM17.85 6a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1Z" />
    </svg>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-12">
      <div className="text-center">
        <a
          href="https://easternpanoramaoffset.com"
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-5"
        >
          <img
            src="logo-footer.png"
            alt="Eastern Panorama Offset"
            className="h-20 mx-auto"
          />
        </a>

        <p className="mt-4 text-sm text-gray-700">
          <a
            className="hover:underline"
            href="https://easternpanoramaoffset.com"
            target="_blank"
            rel="noreferrer"
          >
            Home
          </a>{" "}
          &nbsp;|&nbsp;
          <a
            className="hover:underline"
            href="https://easternpanoramaoffset.com/about-us"
            target="_blank"
            rel="noreferrer"
          >
            About Us
          </a>{" "}
          &nbsp;|&nbsp;
          <a
            className="hover:underline"
            href="#"
            onClick={(e) => e.preventDefault()}
          >
            Services
          </a>{" "}
          &nbsp;|&nbsp;
          <a
            className="hover:underline"
            href="https://easternpanoramaoffset.com/publication"
            target="_blank"
            rel="noreferrer"
          >
            Publications
          </a>{" "}
          &nbsp;|&nbsp;
          <a
            className="hover:underline"
            href="#"
            onClick={(e) => e.preventDefault()}
          >
            Our Works
          </a>{" "}
          &nbsp;|&nbsp;
          <a
            className="hover:underline"
            href="https://easternpanoramaoffset.com/contact-us"
            target="_blank"
            rel="noreferrer"
          >
            Contact Us
          </a>
        </p>

        <hr className="my-4 border-gray-200" />

        <p className="text-sm text-gray-700">
          <IconPhone /> 03642054885 / +91 8794713963 &nbsp;|&nbsp; <IconMail />{" "}
          offset@easternpanorama.in &nbsp;|&nbsp; Eastern Panorama Offset (Admin
          Block),
          <br className="hidden sm:block" />
          2nd Floor RPG Complex, Keating Road, Shillong-793001, Meghalaya, India
        </p>

        <hr className="my-4 border-gray-200" />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-sm text-gray-700">
          {/* Socials (left on md+, centered on mobile) */}
          <div className="flex items-center justify-center gap-4">
            <a
              href="https://www.linkedin.com/company/eastern-panorama-offset/about/"
              target="_blank"
              rel="noreferrer"
              className="text-gray-600 p-2 bg-[#9497A3] rounded-2xl hover:text-white hover:bg-[#0077B5]"
              aria-label="LinkedIn"
            >
              <IconLinkedIn />
            </a>
            <a
              href="https://www.facebook.com/easternpanoramaoffset/"
              target="_blank"
              rel="noreferrer"
              className="text-gray-600 p-2 bg-[#9497A3] rounded-2xl hover:text-white hover:bg-blue-700"
              aria-label="Facebook"
            >
              <IconFacebook />
            </a>
            <a
              href="https://www.instagram.com/eastern_panorama/"
              target="_blank"
              rel="noreferrer"
              className="text-gray-600 p-2 bg-[#9497A3] rounded-2xl hover:text-white hover:bg-[#FD1D1D]"
              aria-label="Instagram"
            >
              <IconInstagram />
            </a>
          </div>

          {/* Copyright / policies */}
          <div className="text-center md:text-right">
            © 2025 Eastern Panorama Offset. All rights reserved. &nbsp;|&nbsp;
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="hover:underline"
            >
              Privacy Policy
            </a>{" "}
            &nbsp;|&nbsp;
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="hover:underline"
            >
              Terms &amp; Conditions
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  const { user } = useAuth();

  const showAttendance = can(user, "attendance.view");
  const showSales = can(user, "sales.dashboard.view");
  const showEA = can(user, "ea.dashboard.view");
  const showJobFms =
    can(user, "jobfms.writer.view") ||
    can(user, "jobfms.coordinator.view") ||
    can(user, "jobfms.designer.view") ||
    can(user, "jobfms.crm.view");

  const isBossAdmin = user?.role === "BOSS" || user?.role === "ADMIN";

  return (
    <div className="min-h-screen px-4 lg:px-27 flex flex-col justify-between">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {showAttendance && (
          <Card
            to="/attendance"
            title="Attendance Dashboard"
            desc="View presence, stats, and reports."
          />
        )}
        {showSales && (
          <Card
            to="/sales"
            title="Sales Process Tracker"
            desc="Dashboard + role-based stage tabs."
          />
        )}
        {showEA && (
          <Card
            to="/task"
            title="EA / Task Dashboard"
            desc="EA-only task workflows."
          />
        )}
        {isBossAdmin && (
          <Card
            to="/create-user"
            title="Create User"
            desc="Add employees with department & role."
          />
        )}
        {!showSales && !showEA && showAttendance && (
          <div className="sm:col-span-2 lg:col-span-3 text-gray-500">
            You currently have access to Attendance only.
          </div>
        )}
        {showJobFms && (
            <Card 
                to="/job-fms/writer"
                title="Job FMS Dashboard"
                desc="Manage job cards, design assignments & approvals."
            />
        )}
      </div>

      <div>
        {/* Footer */}
        <SiteFooter />
      </div>
    </div>
  );
}
