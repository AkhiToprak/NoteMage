import { CSSProperties } from 'react';

interface NavIconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function DashboardIcon({ size = 24, color = 'currentColor', style }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <g clipPath="url(#dashboard_icon_clip)">
        <path
          d="M22.28 6.90994L20.89 7.22994C19.9 7.45994 19.12 8.22994 18.89 9.22994L18.57 10.6199C18.54 10.7599 18.32 10.7599 18.29 10.6199L17.97 9.22994C17.74 8.23994 16.97 7.45994 15.97 7.22994L14.58 6.90994C14.44 6.87994 14.44 6.65994 14.58 6.62994L15.97 6.30994C16.96 6.07994 17.74 5.30994 17.97 4.30994L18.29 2.91994C18.32 2.77994 18.54 2.77994 18.57 2.91994L18.89 4.30994C19.12 5.29994 19.89 6.07994 20.89 6.30994L22.28 6.62994C22.42 6.65994 22.42 6.87994 22.28 6.90994Z"
          stroke={color}
          strokeWidth="1.5"
          strokeMiterlimit="10"
        />
        <path
          d="M14.46 3.02005C13.02 1.90005 10.99 1.90005 9.55001 3.02005L3.55001 7.69005C2.58001 8.45005 2.01001 9.61005 2.01001 10.8501V18.0001C2.01001 20.2101 3.80001 22.0001 6.01001 22.0001H18.01C20.22 22.0001 22.01 20.2101 22.01 18.0001V10.8501"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path d="M12 15V18" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <defs>
        <clipPath id="dashboard_icon_clip">
          <rect width="24" height="24" fill="none" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function NotebookIcon({ size = 24, color = 'currentColor', style }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <g clipPath="url(#notebook_icon_clip)">
        <path
          d="M3.5 18V7C3.5 3 4.5 2 8.5 2H15.5C19.5 2 20.5 3 20.5 7V17C20.5 17.14 20.5 17.28 20.49 17.42"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6.35 15H20.5V18.5C20.5 20.43 18.93 22 17 22H7C5.07 22 3.5 20.43 3.5 18.5V17.85C3.5 16.28 4.78 15 6.35 15Z"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 7H16"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 10.5H13"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="notebook_icon_clip">
          <rect width="24" height="24" fill="none" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function CanvasIcon({ size = 24, color = 'currentColor', style }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <g clipPath="url(#canvas_icon_clip)">
        <path
          d="M10.97 2H8.96997C3.96997 2 1.96997 4 1.96997 9V15C1.96997 20 3.96997 22 8.96997 22H14.97C19.97 22 21.97 20 21.97 15V13"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M21.8799 3.56022C20.6499 6.63022 17.5599 10.8102 14.9799 12.8802L13.3999 14.1402C13.1999 14.2902 12.9999 14.4102 12.7699 14.5002C12.7699 14.3502 12.7599 14.2002 12.7399 14.0402C12.6499 13.3702 12.3499 12.7402 11.8099 12.2102C11.2599 11.6602 10.5999 11.3502 9.91994 11.2602C9.75994 11.2502 9.59994 11.2402 9.43994 11.2502C9.52994 11.0002 9.65994 10.7702 9.82994 10.5802L11.0899 9.00022C13.1599 6.42022 17.3499 3.31022 20.4099 2.08022C20.8799 1.90022 21.3399 2.04022 21.6299 2.33022C21.9299 2.63022 22.0699 3.09022 21.8799 3.56022Z"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.78 14.4905C12.78 15.3705 12.44 16.2105 11.81 16.8505C11.32 17.3405 10.66 17.6805 9.86997 17.7805L7.89997 17.9905C6.82997 18.1105 5.90997 17.2005 6.02997 16.1105L6.23997 14.1405C6.42997 12.3905 7.88997 11.2705 9.44997 11.2405C9.60997 11.2305 9.76997 11.2405 9.92997 11.2505C10.61 11.3405 11.27 11.6505 11.82 12.2005C12.36 12.7405 12.66 13.3605 12.75 14.0305C12.77 14.1905 12.78 14.3505 12.78 14.4905Z"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.82 11.9795C15.82 9.88945 14.13 8.18945 12.03 8.18945"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="canvas_icon_clip">
          <rect width="24" height="24" fill="none" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function TextFileIcon({ size = 24, color = 'currentColor', style }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <g clipPath="url(#textfile_icon_clip)">
        <path
          d="M22 10V15C22 20 20 22 15 22H9C4 22 2 20 2 15V9C2 4 4 2 9 2H14"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M22 10H18C15 10 14 9 14 6V2L22 10Z"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 13H13"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 17H11"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="textfile_icon_clip">
          <rect width="24" height="24" fill="none" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function CoWorkIcon({ size = 24, color = 'currentColor', style }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <g clipPath="url(#cowork_icon_clip)">
        <path
          d="M7.41002 19.6101L6.42002 19.8401C5.71002 20.0001 5.16002 20.5601 4.99002 21.2701L4.76002 22.2601C4.74002 22.3601 4.58002 22.3601 4.56002 22.2601L4.33002 21.2701C4.17002 20.5601 3.61002 20.0101 2.90002 19.8401L1.91002 19.6101C1.81002 19.5901 1.81002 19.4301 1.91002 19.4101L2.90002 19.1801C3.61002 19.0201 4.16002 18.4601 4.33002 17.7501L4.56002 16.7601C4.58002 16.6601 4.74002 16.6601 4.76002 16.7601L4.99002 17.7501C5.15002 18.4601 5.71002 19.0101 6.42002 19.1801L7.41002 19.4101C7.51002 19.4301 7.51002 19.5901 7.41002 19.6101Z"
          stroke={color}
          strokeWidth="1.5"
          strokeMiterlimit="10"
        />
        <path
          d="M9.16 10.87C9.06 10.86 8.94 10.86 8.83 10.87C6.45 10.79 4.56 8.84 4.56 6.44C4.56 4.04 6.54 2 9 2C11.46 2 13.44 3.99 13.44 6.44C13.43 8.84 11.54 10.79 9.16 10.87Z"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          opacity="0.4"
          d="M16.41 4C18.35 4 19.91 5.57 19.91 7.5C19.91 9.43 18.41 10.93 16.54 11C16.46 10.99 16.37 10.99 16.28 11"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.00002 21.81C10.87 21.84 12.75 21.38 14.17 20.43C16.59 18.81 16.59 16.17 14.17 14.56C12.76 13.62 10.87 13.16 9.00002 13.19C8.00002 13.21 7.01002 13.36 6.10002 13.65C5.72002 13.77 5.36002 13.91 5.02002 14.08"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          opacity="0.4"
          d="M18.34 20C19.06 19.85 19.74 19.56 20.3 19.13C21.86 17.96 21.86 16.03 20.3 14.86C19.75 14.44 19.08 14.16 18.37 14"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="cowork_icon_clip">
          <rect width="24" height="24" fill="none" />
        </clipPath>
      </defs>
    </svg>
  );
}
