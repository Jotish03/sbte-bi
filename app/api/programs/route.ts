//api/programs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import * as z from "zod";

const prisma = new PrismaClient();

// Validation schema for program creation
const programSchema = z.object({
  name: z
    .string()
    .min(3, "Name must be at least 3 characters")
    .max(100, "Name must be less than 100 characters"),
  code: z
    .string()
    .min(2, "Code must be at least 2 characters")
    .max(20, "Code must be less than 20 characters"),
  alias: z
    .string()
    .min(2, "Alias must be at least 2 characters")
    .max(50, "Alias must be less than 50 characters"),
  departmentId: z.string({
    required_error: "Department ID is required",
  }),
  programTypeId: z.string({
    required_error: "Program Type ID is required",
  }),
  isActive: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user?.role !== "COLLEGE_SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const collegeId = session.user.collegeId;
    if (!collegeId) {
      return NextResponse.json(
        { error: "User is not associated with a college" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Log the received data for debugging
    console.log("Received data:", body);

    const validationResult = programSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.format(),
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verify department belongs to user's college
    const department = await prisma.department.findUnique({
      where: {
        id: data.departmentId,
        collegeId,
      },
    });

    if (!department) {
      return NextResponse.json(
        { error: "Invalid department for this college" },
        { status: 400 }
      );
    }

    // Verify program type belongs to user's college
    const programType = await prisma.programType.findUnique({
      where: {
        id: data.programTypeId,
        collegeId,
      },
    });

    if (!programType) {
      return NextResponse.json(
        { error: "Invalid program type for this college" },
        { status: 400 }
      );
    }

    // Check if program code already exists
    const existingProgram = await prisma.program.findFirst({
      where: {
        code: data.code,
        department: {
          collegeId,
        },
      },
    });

    if (existingProgram) {
      return NextResponse.json(
        { error: "Program code already exists in this college" },
        { status: 409 }
      );
    }

    const newProgram = await prisma.program.create({
      data: {
        name: data.name,
        code: data.code,
        alias: data.alias,
        department: { connect: { id: data.departmentId } },
        programType: { connect: { id: data.programTypeId } },
        isActive: data.isActive,
      },
      include: {
        department: { select: { name: true } },
        programType: { select: { name: true } },
      },
    });

    return NextResponse.json(newProgram, { status: 201 });
  } catch (error) {
    console.error("Error creating program:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const collegeId = session.user.collegeId;
    if (!collegeId) {
      return NextResponse.json(
        { error: "User is not associated with a college" },
        { status: 400 }
      );
    }

    const programs = await prisma.program.findMany({
      where: {
        department: {
          collegeId,
        },
      },
      include: {
        department: { select: { name: true } },
        programType: { select: { name: true } },
      },
    });

    return NextResponse.json(programs, { status: 200 });
  } catch (error) {
    console.error("Error fetching programs:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
