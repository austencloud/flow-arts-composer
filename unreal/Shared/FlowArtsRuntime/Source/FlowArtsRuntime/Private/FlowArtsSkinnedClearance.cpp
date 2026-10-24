#include "FlowArtsSkinnedClearance.h"
#include "FlowArtsArmClearance.h"
#include "FlowArtsConservativeCover.h"

#include "Engine/SkeletalMesh.h"
#include "ProfilingDebugging/CpuProfilerTrace.h"
#include "Rendering/SkeletalMeshRenderData.h"
#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/Parse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#endif

DEFINE_LOG_CATEGORY_STATIC(LogFlowArtsSkin, Log, All);

namespace
{
constexpr int32 BandCount = 8;
using FPolygon = TArray<FVector, TInlineAllocator<32>>;

void Clip(FPolygon& Polygon, const FVector& Normal, double Offset)
{
    FPolygon Next;
    for (int32 I = 0; I < Polygon.Num(); ++I)
    {
        const FVector A = Polygon[I], B = Polygon[(I + 1) % Polygon.Num()];
        const double DA = FVector::DotProduct(Normal, A) - Offset;
        const double DB = FVector::DotProduct(Normal, B) - Offset;
        if (DA <= 0.) Next.Add(A);
        if ((DA <= 0.) != (DB <= 0.)) Next.Add(A + (B - A) * (DA / (DA - DB)));
    }
    Polygon = MoveTemp(Next);
}

// Bind-domain clipping interpolates already skinned endpoints: skinning is linear across a triangle.
FPolygon ExposedTriangle(const FFlowArtsSkinnedClearanceData::FTriangle& Triangle,
    const FVector* TrianglePoints)
{
    struct FPoint { FVector Position; double Fraction; };
    TArray<FPoint, TInlineAllocator<8>> Polygon;
    for (int32 I = 0; I < 3; ++I)
        Polygon.Add({TrianglePoints[I], Triangle.BindArmFractions[I]});
    for (int32 Boundary = 0; Boundary < 2; ++Boundary)
    {
        TArray<FPoint, TInlineAllocator<8>> Next;
        for (int32 I = 0; I < Polygon.Num(); ++I)
        {
            const auto& A = Polygon[I]; const auto& B = Polygon[(I + 1) % Polygon.Num()];
            const double DA = Boundary == 0 ? .23 - A.Fraction : A.Fraction - 1.;
            const double DB = Boundary == 0 ? .23 - B.Fraction : B.Fraction - 1.;
            if (DA <= 0.) Next.Add(A);
            if ((DA <= 0.) != (DB <= 0.))
            {
                const double T = DA / (DA - DB);
                Next.Add({FMath::Lerp(A.Position, B.Position, T), FMath::Lerp(A.Fraction, B.Fraction, T)});
            }
        }
        Polygon = MoveTemp(Next);
    }
    FPolygon Result;
    for (const auto& Point : Polygon) Result.Add(Point.Position);
    return Result;
}

FPolygon ExposedTriangle(const FFlowArtsSkinnedClearanceData::FTriangle& Triangle,
    const TArray<FVector>& Points)
{
    const FVector TrianglePoints[3] = {Points[Triangle.Vertices.X],Points[Triangle.Vertices.Y],Points[Triangle.Vertices.Z]};
    return ExposedTriangle(Triangle, TrianglePoints);
}

bool CapsDoNotIntersect(const TArray<FIntVector>& Original,const TArray<FIntVector>& Caps,
    const TArray<FVector>& Points,bool bLog);

// Triangulate a simple boundary in its dominant projection. Unlike a mean-center fan,
// ear clipping remains valid for concave shirt/shoulder seams. Reject crossings/degeneracy.
bool CapLoopProjected(const TArray<int32>& Loop,const TArray<FVector>& Points,TArray<FIntVector>& Out,int32 Drop,
    const FVector* ProjectionNormal=nullptr,const TSet<uint64>* ForbiddenDiagonals=nullptr,
    const TArray<FIntVector>* ExistingFaces=nullptr)
{
    if(Loop.Num()<3||Loop.Num()>4096)return false;
    FVector N=FVector::ZeroVector;const FVector Origin=Points[Loop[0]];
    for(int32 I=0;I<Loop.Num();++I)N+=(Points[Loop[I]]-Origin)^(Points[Loop[(I+1)%Loop.Num()]]-Origin);

    if(N.SizeSquared()<1.e-12)return false;
    FVector ProjectionU,ProjectionV;
    if(ProjectionNormal)
    {
        const FVector Reference=FMath::Abs(ProjectionNormal->X)<.9?FVector::XAxisVector:FVector::YAxisVector;
        ProjectionU=FVector::CrossProduct(*ProjectionNormal,Reference).GetSafeNormal();
        ProjectionV=FVector::CrossProduct(*ProjectionNormal,ProjectionU);
    }
    TArray<FVector2D> P;for(int32 Index:Loop){const auto& Q=Points[Index];P.Add(ProjectionNormal?
        FVector2D(FVector::DotProduct(Q,ProjectionU),FVector::DotProduct(Q,ProjectionV)):FVector2D(Q[(Drop+1)%3],Q[(Drop+2)%3]));}
    const auto Cross=[](const FVector2D& A,const FVector2D& B,const FVector2D& C){return (B.X-A.X)*(C.Y-A.Y)-(B.Y-A.Y)*(C.X-A.X);};
    for(int32 I=0;I<P.Num();++I)for(int32 J=I+1;J<P.Num();++J)
    {
        const int32 I1=(I+1)%P.Num(),J1=(J+1)%P.Num();if(I==J||I1==J||J1==I)continue;
        if(FMath::Max(P[I].X,P[I1].X)<FMath::Min(P[J].X,P[J1].X)||FMath::Max(P[J].X,P[J1].X)<FMath::Min(P[I].X,P[I1].X)||FMath::Max(P[I].Y,P[I1].Y)<FMath::Min(P[J].Y,P[J1].Y)||FMath::Max(P[J].Y,P[J1].Y)<FMath::Min(P[I].Y,P[I1].Y))continue;
        if(Cross(P[I],P[I1],P[J])*Cross(P[I],P[I1],P[J1])<=0. && Cross(P[J],P[J1],P[I])*Cross(P[J],P[J1],P[I1])<=0.)return false;
    }
    double Area=0.;for(int32 I=0;I<P.Num();++I)Area+=P[I].X*P[(I+1)%P.Num()].Y-P[(I+1)%P.Num()].X*P[I].Y;
    if(FMath::Abs(Area)<1.e-9)return false;const double Sign=Area>0.?1.:-1.;
    const int32 FirstCap=Out.Num();
    TMap<FIntVector,bool> Admissible;
    const auto CapAdmissible=[&](int32 A,int32 B,int32 C)
    {
        if(!ExistingFaces)return true;
        const FIntVector Candidate(Loop[C],Loop[B],Loop[A]);
        if(const bool* Cached=Admissible.Find(Candidate))return *Cached;
        TArray<FIntVector> Single;Single.Add(Candidate);
        const bool bSafe=CapsDoNotIntersect(*ExistingFaces,Single,Points,false);
        Admissible.Add(Candidate,bSafe);return bSafe;
    };
    TArray<int32> Remaining;for(int32 I=0;I<P.Num();++I)Remaining.Add(I);
    bool bGreedyFailed=false;
    while(Remaining.Num()>3)
    {
        bool Found=false;
        for(int32 I=0;I<Remaining.Num();++I)
        {
            const int32 A=Remaining[(I+Remaining.Num()-1)%Remaining.Num()],B=Remaining[I],C=Remaining[(I+1)%Remaining.Num()];
            if(Cross(P[A],P[B],P[C])*Sign<=1.e-10)continue;
            // A cap diagonal must not reuse an existing interior surface edge:
            // that would create four incident faces despite a valid 2D polygon.
            if(ForbiddenDiagonals && (A+1)%Loop.Num()!=C && (C+1)%Loop.Num()!=A &&
                ForbiddenDiagonals->Contains((uint64(FMath::Min(Loop[A],Loop[C]))<<32)|uint32(FMath::Max(Loop[A],Loop[C]))))continue;
            bool Occupied=false;
            for(int32 V:Remaining)if(V!=A&&V!=B&&V!=C&&Cross(P[A],P[B],P[V])*Sign>=-1.e-10&&Cross(P[B],P[C],P[V])*Sign>=-1.e-10&&Cross(P[C],P[A],P[V])*Sign>=-1.e-10){Occupied=true;break;}
            if(Occupied)continue;
            if(!CapAdmissible(A,B,C))continue;
            Out.Add(FIntVector(Loop[C],Loop[B],Loop[A]));Remaining.RemoveAt(I);Found=true;break;
        }
        if(!Found){bGreedyFailed=true;break;}
    }
    if(!bGreedyFailed)
    {
        if(CapAdmissible(Remaining[0],Remaining[1],Remaining[2]))
        {
            Out.Add(FIntVector(Loop[Remaining[2]],Loop[Remaining[1]],Loop[Remaining[0]]));
            return true;
        }
        bGreedyFailed=true;
    }
    Out.SetNum(FirstCap);
    // A legal first ear can strand a later forbidden interior diagonal. For
    // bounded seams, search the alternative triangulations without changing
    // the original faces or the final oriented-edge manifold validation.
    const int32 Count=P.Num();
    if(Count>128)return false;
    const auto IsBoundary=[Count](int32 A,int32 B)
    {return (A+1)%Count==B||(B+1)%Count==A;};
    const auto LegalDiagonal=[&](int32 A,int32 B)
    {
        if(IsBoundary(A,B))return true;
        if(ForbiddenDiagonals && ForbiddenDiagonals->Contains(
            (uint64(FMath::Min(Loop[A],Loop[B]))<<32)|uint32(FMath::Max(Loop[A],Loop[B]))))return false;
        for(int32 E=0;E<Count;++E)
        {
            const int32 F=(E+1)%Count;
            if(E==A||E==B||F==A||F==B)continue;
            if(FMath::Max(P[A].X,P[B].X)<FMath::Min(P[E].X,P[F].X)||
               FMath::Max(P[E].X,P[F].X)<FMath::Min(P[A].X,P[B].X)||
               FMath::Max(P[A].Y,P[B].Y)<FMath::Min(P[E].Y,P[F].Y)||
               FMath::Max(P[E].Y,P[F].Y)<FMath::Min(P[A].Y,P[B].Y))continue;
            if(Cross(P[A],P[B],P[E])*Cross(P[A],P[B],P[F])<=0.&&
               Cross(P[E],P[F],P[A])*Cross(P[E],P[F],P[B])<=0.)return false;
        }
        const FVector2D Mid=(P[A]+P[B])*.5;
        bool bInside=false;
        for(int32 E=0,F=Count-1;E<Count;F=E++)
            if((P[E].Y>Mid.Y)!=(P[F].Y>Mid.Y) &&
               Mid.X<(P[F].X-P[E].X)*(Mid.Y-P[E].Y)/(P[F].Y-P[E].Y)+P[E].X)
                bInside=!bInside;
        return bInside;
    };
    TArray<uint8> Diagonal;Diagonal.SetNumZeroed(Count*Count);
    for(int32 A=0;A<Count;++A)for(int32 B=A+1;B<Count;++B)
        Diagonal[A*Count+B]=Diagonal[B*Count+A]=LegalDiagonal(A,B)?1:0;
    TArray<int16> Split;Split.Init(-1,Count*Count);
    for(int32 I=0;I+1<Count;++I)Split[I*Count+I+1]=I;
    for(int32 Width=2;Width<Count;++Width)
        for(int32 A=0;A+Width<Count;++A)
        {
            const int32 B=A+Width;
            if(!Diagonal[A*Count+B])continue;
            for(int32 K=A+1;K<B;++K)
            {
                if(Split[A*Count+K]<0||Split[K*Count+B]<0||
                   !Diagonal[A*Count+K]||!Diagonal[K*Count+B]||
                   Cross(P[A],P[K],P[B])*Sign<=1.e-10||!CapAdmissible(A,K,B))continue;
                Split[A*Count+B]=int16(K);break;
            }
        }
    if(Split[Count-1]<0)return false;
    TArray<FIntPoint> Pending;Pending.Add(FIntPoint(0,Count-1));
    while(!Pending.IsEmpty())
    {
        const FIntPoint Range=Pending.Pop(EAllowShrinking::No);
        if(Range.Y-Range.X<2)continue;
        const int32 K=Split[Range.X*Count+Range.Y];
        if(K<=Range.X||K>=Range.Y)return false;
        Out.Add(FIntVector(Loop[Range.Y],Loop[K],Loop[Range.X]));
        Pending.Add(FIntPoint(Range.X,K));Pending.Add(FIntPoint(K,Range.Y));
    }
    return Out.Num()-FirstCap==Count-2;
}

bool CapLoop(const TArray<int32>& Loop,const TArray<FVector>& Points,TArray<FIntVector>& Out,
    const TSet<uint64>* ForbiddenDiagonals=nullptr,const TArray<FIntVector>* ExistingFaces=nullptr)
{
    // A simple nonplanar seam need not be simple in any coordinate projection.
    // Every fallback still requires a crossing-free projection and complete ear
    // triangulation; final oriented-edge closure is checked by CloseArmRegion.
    FVector Newell=FVector::ZeroVector;
    const FVector Origin=Points[Loop[0]];
    for(int32 I=0;I<Loop.Num();++I)
        Newell+=(Points[Loop[I]]-Origin)^(Points[Loop[(I+1)%Loop.Num()]]-Origin);
    if(Newell.Normalize())
    {
        TArray<FIntVector> Caps;
        if(CapLoopProjected(Loop,Points,Caps,0,&Newell,ForbiddenDiagonals,ExistingFaces))
        {Out.Append(Caps);return true;}
    }
    for(int32 Axis=0;Axis<3;++Axis)
    {
        TArray<FIntVector> Caps;
        if(CapLoopProjected(Loop,Points,Caps,Axis,nullptr,ForbiddenDiagonals,ExistingFaces)){Out.Append(Caps);return true;}
    }
    // A seam can fold over itself in the principal projections yet have a
    // simple slightly oblique projection. Try a small deterministic lattice
    // around each principal axis before the coarser sphere samples.
    for(int32 Axis=0;Axis<3;++Axis)
        for(int32 SlopeA=-2;SlopeA<=2;++SlopeA)
            for(int32 SlopeB=-2;SlopeB<=2;++SlopeB)
            {
                if(SlopeA==0&&SlopeB==0)continue;
                FVector Normal=FVector::ZeroVector;
                Normal[Axis]=1.;Normal[(Axis+1)%3]=double(SlopeA)*.125;
                Normal[(Axis+2)%3]=double(SlopeB)*.125;
                Normal.Normalize();
                TArray<FIntVector> Caps;
                if(CapLoopProjected(Loop,Points,Caps,0,&Normal,ForbiddenDiagonals,ExistingFaces))
                {Out.Append(Caps);return true;}
            }
    for(int32 I=0;I<64;++I)
    {
        const double Z=1.-2.*(double(I)+.5)/64.,Phi=double(I)*2.399963229728653;
        const double Radius=FMath::Sqrt(1.-Z*Z);
        const FVector Normal(Radius*FMath::Cos(Phi),Radius*FMath::Sin(Phi),Z);
        TArray<FIntVector> Caps;
        if(CapLoopProjected(Loop,Points,Caps,0,&Normal,ForbiddenDiagonals,ExistingFaces)){Out.Append(Caps);return true;}
    }
    return false;
}

// A boundary walk can revisit a pinched vertex. Split it into simple edge loops;
// no edge or original face is discarded, and the final paired-edge check remains mandatory.
bool CapBoundaryWalk(const TArray<int32>& Walk,const TArray<FVector>& Points,TArray<FIntVector>& Out,
    const TSet<uint64>* ForbiddenDiagonals=nullptr,const TArray<FIntVector>* ExistingFaces=nullptr)
{
    TArray<TArray<int32>> Pending;Pending.Add(Walk);
    while(!Pending.IsEmpty())
    {
        TArray<int32> Loop=Pending.Pop(EAllowShrinking::No);TMap<int32,int32> Seen;bool Split=false;
        for(int32 I=0;I<Loop.Num();++I)
        {
            if(const int32* First=Seen.Find(Loop[I]))
            {
                TArray<int32> Part;for(int32 J=*First;J<I;++J)Part.Add(Loop[J]);
                if(Part.Num()<3||Loop.Num()-Part.Num()<3)return false;
                Loop.RemoveAt(*First,I-*First,EAllowShrinking::No);
                Pending.Add(MoveTemp(Part));Pending.Add(MoveTemp(Loop));Split=true;break;
            }
            Seen.Add(Loop[I],I);
        }
        if(!Split&&!CapLoop(Loop,Points,Out,ForbiddenDiagonals,ExistingFaces))
        {
            UE_LOG(LogFlowArtsSkin, Verbose, TEXT("Closed-body cap projection failed: seam vertices=%d"), Loop.Num());
            return false;
        }
    }
    return true;
}

FVector ClosestTriangle(const FVector& P, const FVector& A, const FVector& B, const FVector& C)
{
    const FVector AB=B-A, AC=C-A, AP=P-A;
    const double D1=AB|AP, D2=AC|AP;
    if(D1<=0 && D2<=0) return A;
    const FVector BP=P-B; const double D3=AB|BP, D4=AC|BP;
    if(D3>=0 && D4<=D3) return B;
    const double VC=D1*D4-D3*D2;
    if(VC<=0 && D1>=0 && D3<=0) return A+AB*(D1/(D1-D3));
    const FVector CP=P-C; const double D5=AB|CP, D6=AC|CP;
    if(D6>=0 && D5<=D6) return C;
    const double VB=D5*D2-D1*D6;
    if(VB<=0 && D2>=0 && D6<=0) return A+AC*(D2/(D2-D6));
    const double VA=D3*D6-D5*D4;
    if(VA<=0 && D4-D3>=0 && D5-D6>=0) return B+(C-B)*((D4-D3)/((D4-D3)+(D5-D6)));
    const double Den=VA+VB+VC;
    if(FMath::Abs(Den)<1.e-14) return A;
    return A+AB*(VB/Den)+AC*(VC/Den);
}

double SegmentDistanceSq(const FVector& P, const FVector& Q, const FVector& A, const FVector& B)
{
    const FVector U=Q-P, V=B-A, R=P-A;
    const double AA=U|U, EE=V|V, F=V|R;
    double S=0., T=0.;
    if(AA<1.e-14 && EE<1.e-14) return R.SizeSquared();
    if(AA<1.e-14) T=FMath::Clamp(F/EE,0.,1.);
    else
    {
        const double C=U|R;
        if(EE<1.e-14) S=FMath::Clamp(-C/AA,0.,1.);
        else
        {
            const double BB=U|V, Den=AA*EE-BB*BB;
            if(FMath::Abs(Den)>1.e-14) S=FMath::Clamp((BB*F-C*EE)/Den,0.,1.);
            T=(BB*S+F)/EE;
            if(T<0.) {T=0.; S=FMath::Clamp(-C/AA,0.,1.);}
            else if(T>1.) {T=1.; S=FMath::Clamp((BB-C)/AA,0.,1.);}
        }
    }
    return (P+U*S-A-V*T).SizeSquared();
}

bool RayTriangle(const FVector& P, const FVector& D, const FVector* T, double& Distance, bool& Ambiguous);

double TriangleDistanceSq(const FVector* A, const FVector* B)
{
    double Minimum = TNumericLimits<double>::Max();
    for (int32 K = 0; K < 3; ++K)
    {
        double RayDistance = 0.; bool Ambiguous = false;
        if (RayTriangle(A[K], A[(K+1)%3]-A[K], B, RayDistance, Ambiguous) && RayDistance <= 1.) return 0.;
        if (RayTriangle(B[K], B[(K+1)%3]-B[K], A, RayDistance, Ambiguous) && RayDistance <= 1.) return 0.;
        Minimum = FMath::Min(Minimum, (A[K]-ClosestTriangle(A[K],B[0],B[1],B[2])).SizeSquared());
        Minimum = FMath::Min(Minimum, (B[K]-ClosestTriangle(B[K],A[0],A[1],A[2])).SizeSquared());
        for (int32 J = 0; J < 3; ++J)
            Minimum = FMath::Min(Minimum, SegmentDistanceSq(A[K],A[(K+1)%3],B[J],B[(J+1)%3]));
    }
    return Minimum;
}

// Edge pairing alone does not establish an embedded closed surface. A cap that
// pierces an unrelated original face (or another cap) would make containment
// parity unsound. Shared edges/vertices are legal only at their common border;
// inset the two faces very slightly to test their interiors in that case.
bool CapsDoNotIntersect(const TArray<FIntVector>& Original,const TArray<FIntVector>& Caps,
    const TArray<FVector>& Points,bool bLog)
{
    TArray<FBox> Boxes;Boxes.Reserve(Original.Num()+Caps.Num());
    const auto GetTriangle=[&](int32 Index)->const FIntVector&
    {return Index<Original.Num()?Original[Index]:Caps[Index-Original.Num()];};
    for(int32 I=0;I<Original.Num()+Caps.Num();++I)
    {
        const FIntVector& T=GetTriangle(I);FBox Box(ForceInit);
        for(int32 K=0;K<3;++K)Box+=Points[T[K]];
        Boxes.Add(Box);
    }
    for(int32 J=Original.Num();J<Boxes.Num();++J)
    {
        const FIntVector& TJ=GetTriangle(J);
        for(int32 I=0;I<J;++I)
        {
            if(!Boxes[I].Intersect(Boxes[J]))continue;
            const FIntVector& TI=GetTriangle(I);
            int32 Shared=0;
            for(int32 A=0;A<3;++A)for(int32 B=0;B<3;++B)
                Shared+=TI[A]==TJ[B]?1:0;
            if(Shared==3)
            {
                if(bLog)UE_LOG(LogFlowArtsSkin,Verbose,TEXT("Cap overlap: cap=%d face=%d shared=3"),J-Original.Num(),I);
                return false;
            }
            FVector A[3],B[3];
            for(int32 K=0;K<3;++K){A[K]=Points[TI[K]];B[K]=Points[TJ[K]];}
            if(Shared==2)
            {
                // Two noncoplanar faces meet only along their common edge.
                // Insetting by a microscopic amount and comparing to a fixed
                // tolerance would falsely reject that ordinary manifold edge.
                int32 Edge[2],EA=0,OtherA=INDEX_NONE,OtherB=INDEX_NONE;
                for(int32 K=0;K<3;++K)
                {
                    bool bCommon=false;
                    for(int32 L=0;L<3;++L)bCommon|=TI[K]==TJ[L];
                    if(bCommon)Edge[EA++]=TI[K];else OtherA=TI[K];
                }
                for(int32 K=0;K<3;++K)if(TJ[K]!=Edge[0]&&TJ[K]!=Edge[1])OtherB=TJ[K];
                if(EA!=2||OtherA==INDEX_NONE||OtherB==INDEX_NONE)return false;
                const FVector Along=Points[Edge[1]]-Points[Edge[0]];
                const FVector DA=Points[OtherA]-Points[Edge[0]],DB=Points[OtherB]-Points[Edge[0]];
                const FVector NA=FVector::CrossProduct(Along,DA),NB=FVector::CrossProduct(Along,DB);
                if(NA.SizeSquared()<=1.e-20||NB.SizeSquared()<=1.e-20)return false;
                const double Parallel=FVector::CrossProduct(NA.GetSafeNormal(),NB.GetSafeNormal()).SizeSquared();
                if(Parallel>1.e-16)continue;
                // Coplanar faces are legal only on opposite sides of the edge.
                if((NA|NB)<0.)continue;
                if(bLog)UE_LOG(LogFlowArtsSkin,Verbose,TEXT("Cap overlap: cap=%d face=%d shared=2 coplanar"),J-Original.Num(),I);
                return false;
            }
            if(Shared>0)
            {
                const FVector AC=(A[0]+A[1]+A[2])/3.,BC=(B[0]+B[1]+B[2])/3.;
                for(int32 K=0;K<3;++K){A[K]=FMath::Lerp(A[K],AC,1.e-6);B[K]=FMath::Lerp(B[K],BC,1.e-6);}
            }
            if(TriangleDistanceSq(A,B)<=1.e-12)
            {
                if(bLog)UE_LOG(LogFlowArtsSkin,Verbose,TEXT("Cap overlap: cap=%d face=%d shared=%d"),J-Original.Num(),I,Shared);
                return false;
            }
        }
    }
    return true;
}

double SegmentTriangleDistanceSq(const FVector& Start, const FVector& End, const FVector* Triangle)
{
    double Distance = 0.; bool Ambiguous = false;
    if (RayTriangle(Start, End - Start, Triangle, Distance, Ambiguous) && Distance <= 1.) return 0.;
    double Minimum = TNumericLimits<double>::Max();
    // A collapsed triangle is its three edges, not an arbitrary single vertex.
    if (FVector::CrossProduct(Triangle[1] - Triangle[0], Triangle[2] - Triangle[0]).SizeSquared() > 1.e-24)
    {
        Minimum = (Start - ClosestTriangle(Start, Triangle[0], Triangle[1], Triangle[2])).SizeSquared();
        Minimum = FMath::Min(Minimum, (End - ClosestTriangle(End, Triangle[0], Triangle[1], Triangle[2])).SizeSquared());
    }
    for (int32 Edge = 0; Edge < 3; ++Edge)
        Minimum = FMath::Min(Minimum, SegmentDistanceSq(Start, End, Triangle[Edge], Triangle[(Edge + 1) % 3]));
    return Minimum;
}

// Ranking only. A crossed segment has zero surface distance throughout the
// crossing, so use the shortest separating translation as a descent signal.
double SegmentTriangleCrossingExitDepth(const FVector& Start, const FVector& End,
    const FVector* Triangle)
{
    const FVector Segment = End - Start;
    const FVector Edges[3] = {Triangle[1] - Triangle[0], Triangle[2] - Triangle[1],
        Triangle[0] - Triangle[2]};
    const FVector Axes[4] = {Edges[0] ^ Edges[1], Edges[0] ^ Segment,
        Edges[1] ^ Segment, Edges[2] ^ Segment};
    double Depth = TNumericLimits<double>::Max();
    for (const FVector& Raw : Axes)
    {
        const double LengthSq = Raw.SizeSquared();
        if (LengthSq <= 1.e-12) continue;
        const FVector Axis = Raw / FMath::Sqrt(LengthSq);
        const double S0 = Axis | Start, S1 = Axis | End;
        const double SMin = FMath::Min(S0, S1), SMax = FMath::Max(S0, S1);
        double TMin = TNumericLimits<double>::Max(), TMax = -TMin;
        for (int32 K = 0; K < 3; ++K)
        {
            const double Projection = Axis | Triangle[K];
            TMin = FMath::Min(TMin, Projection);
            TMax = FMath::Max(TMax, Projection);
        }
        if (SMax < TMin || TMax < SMin) return 0.;
        Depth = FMath::Min(Depth, FMath::Min(SMax - TMin, TMax - SMin));
    }
    return Depth == TNumericLimits<double>::Max() ? 0. : FMath::Max(0., Depth);
}

// Search ranking only: smallest translation along a separating axis that exits
// a true triangle crossing. Surface distance alone is zero throughout a crossing.
double TriangleCrossingExitDepth(const FVector* A, const FVector* B)
{
    const FVector AE[3] = {A[1]-A[0],A[2]-A[1],A[0]-A[2]};
    const FVector BE[3] = {B[1]-B[0],B[2]-B[1],B[0]-B[2]};
    FVector Axes[11];
    Axes[0] = AE[0] ^ AE[1]; Axes[1] = BE[0] ^ BE[1];
    for (int32 I = 0; I < 3; ++I) for (int32 J = 0; J < 3; ++J)
        Axes[2+I*3+J] = AE[I] ^ BE[J];
    double Depth = TNumericLimits<double>::Max();
    for (const FVector& Raw : Axes)
    {
        const double LengthSq = Raw.SizeSquared();
        if (LengthSq <= 1.e-12) continue;
        const FVector Axis = Raw / FMath::Sqrt(LengthSq);
        double AMin = TNumericLimits<double>::Max(), AMax = -AMin;
        double BMin = TNumericLimits<double>::Max(), BMax = -BMin;
        for (int32 K = 0; K < 3; ++K)
        {
            const double AP = Axis | A[K], BP = Axis | B[K];
            AMin = FMath::Min(AMin,AP); AMax = FMath::Max(AMax,AP);
            BMin = FMath::Min(BMin,BP); BMax = FMath::Max(BMax,BP);
        }
        if (AMax < BMin || BMax < AMin) return 0.;
        if (AMax-AMin <= 1.e-8 && BMax-BMin <= 1.e-8) continue;
        Depth = FMath::Min(Depth,FMath::Min(AMax-BMin,BMax-AMin));
    }
    return Depth == TNumericLimits<double>::Max() ? 0. : FMath::Max(0.,Depth);
}

// Returns a positive ray parameter; edge/vertex hits are ambiguous for parity.
bool RayTriangle(const FVector& P, const FVector& D, const FVector* T, double& Distance, bool& Ambiguous)
{
    const FVector E1=T[1]-T[0], E2=T[2]-T[0], H=D^E2;
    const double Det=E1|H;
    if(FMath::Abs(Det)<1.e-12) return false;
    const FVector S=P-T[0], Q=S^E1;
    const double U=(S|H)/Det, V=(D|Q)/Det;
    Distance=(E2|Q)/Det;
    if(U<0. || V<0. || U+V>1. || Distance<=1.e-7) return false;
    Ambiguous |= U<1.e-7 || V<1.e-7 || 1.-U-V<1.e-7;
    return true;
}

struct FSurfaceTree
{
    using FNode = FFlowArtsSkinnedClearanceData::FSurfaceNode;
    TArray<FNode> Nodes;
    TArray<int32> Order;
    TArray<FBox> Bounds;
    const TArray<FVector>& Points;
    const TArray<FIntVector>& Triangles;
    const TArray<int32>* Components=nullptr;
    int32 ComponentCount=1;
    bool bRequireEscapeRay=false;
    FSurfaceTree(const TArray<FVector>& InPoints, const TArray<FIntVector>& InTriangles):Points(InPoints),Triangles(InTriangles)
    {
        for(int32 I=0; I<Triangles.Num(); ++I)
        {
            FBox Box(ForceInit); for(int32 K=0; K<3; ++K) Box+=Points[Triangles[I][K]];
            Bounds.Add(Box); Order.Add(I);
        }
        if(!Order.IsEmpty()) Build(0,Order.Num());
    }
    FSurfaceTree(const TArray<FVector>& InPoints, const TArray<FIntVector>& InTriangles,
        const FFlowArtsSkinnedClearanceData::FSurfaceTopology& Topology)
        : Nodes(Topology.Nodes), Order(Topology.Order), Points(InPoints), Triangles(InTriangles)
    {
        Bounds.Reserve(Triangles.Num());
        for (const FIntVector& Triangle : Triangles)
        {
            FBox Box(ForceInit);
            for (int32 K = 0; K < 3; ++K) Box += Points[Triangle[K]];
            Bounds.Add(Box);
        }
        // Build stores parents before children, so reverse order refits every child first.
        // A partition need not match posed centroids: enclosing bounds preserve all checks.
        for (int32 I = Nodes.Num() - 1; I >= 0; --I)
        {
            FNode& Node = Nodes[I];
            Node.Bounds = FBox(ForceInit);
            if (Node.Left != INDEX_NONE)
            {
                Node.Bounds += Nodes[Node.Left].Bounds;
                Node.Bounds += Nodes[Node.Right].Bounds;
            }
            else for (int32 J = Node.Begin; J < Node.End; ++J) Node.Bounds += Bounds[Order[J]];
        }
    }
    int32 Build(int32 Begin, int32 End)
    {
        const int32 Index=Nodes.AddDefaulted(); FNode Node; Node.Begin=Begin; Node.End=End;
        for(int32 I=Begin; I<End; ++I) Node.Bounds+=Bounds[Order[I]];
        if(End-Begin>8)
        {
            const FVector Ext=Node.Bounds.GetSize(); const int32 Axis=Ext.X>Ext.Y ? (Ext.X>Ext.Z?0:2):(Ext.Y>Ext.Z?1:2);
            TArrayView<int32> Range(Order.GetData()+Begin,End-Begin);
            Range.Sort([&](int32 A,int32 B){return Bounds[A].GetCenter()[Axis]<Bounds[B].GetCenter()[Axis];});
            const int32 Mid=(Begin+End)/2; Node.Left=Build(Begin,Mid); Node.Right=Build(Mid,End);
        }
        Nodes[Index]=Node; return Index;
    }
    bool RayBox(const FBox& Box,const FVector& P,const FVector& D) const
    {
        double Lo=0.,Hi=TNumericLimits<double>::Max();
        for(int32 I=0;I<3;++I)
        {
            if(FMath::Abs(D[I])<1.e-12) {if(P[I]<Box.Min[I]||P[I]>Box.Max[I])return false;}
            else {double A=(Box.Min[I]-P[I])/D[I],B=(Box.Max[I]-P[I])/D[I]; if(A>B)Swap(A,B);Lo=FMath::Max(Lo,A);Hi=FMath::Min(Hi,B);if(Hi<Lo)return false;}
        }
        return true;
    }
    void Ray(int32 Index,const FVector& P,const FVector& D,TArrayView<int32> Hits,bool& Ambiguous) const
    {
        const auto& N=Nodes[Index]; if(!RayBox(N.Bounds,P,D))return;
        if(N.Left!=INDEX_NONE){Ray(N.Left,P,D,Hits,Ambiguous);Ray(N.Right,P,D,Hits,Ambiguous);return;}
        for(int32 I=N.Begin;I<N.End;++I)
        {
            const auto& T=Triangles[Order[I]];const FVector V[3]={Points[T.X],Points[T.Y],Points[T.Z]};double Distance=0.;
            if(RayTriangle(P,D,V,Distance,Ambiguous))++Hits[Components?(*Components)[Order[I]]:0];
        }
    }
    bool Outside(const FVector& Point) const
    {
        if (Nodes.IsEmpty() || ComponentCount < 1 || ComponentCount > 128) return false;
        // Every closed-body triangle (including caps) is enclosed by this posed bound.
        // A point strictly beyond it cannot be inside any component. Padding is checked
        // separately by Near(), before containment is consulted.
        if (!Nodes[0].Bounds.IsInsideOrOn(Point)) return true;
        // Independent oblique directions avoid axial seams. Any inside/degenerate result rejects.
        const FVector Directions[]={FVector(1.,.317,.193),FVector(-.271,1.,.413),FVector(.239,-.379,1.),FVector(-1.,-.431,.283),FVector(.163,-1.,-.347),FVector(-.419,.227,-1.)};
        for (const auto& D : Directions)
        {
            TArray<int32,TInlineAllocator<128>> Hits;
            Hits.Init(0,ComponentCount);
            bool Ambiguous=false;
            Ray(0,Point,D,MakeArrayView(Hits.GetData(),Hits.Num()),Ambiguous);
            if (bRequireEscapeRay)
            {
                // Posing can fold a closed influence region into overlapping lobes.
                // Even parity does not prove exclusion there; an unobstructed ray
                // to infinity does, without assuming the posed surface is embedded.
                if (Ambiguous) continue;
                bool bNoHits=true;
                for (int32 H : Hits) bNoHits &= H==0;
                if (bNoHits) return true;
            }
            else
            {
                if (Ambiguous) return false;
                for (int32 H : Hits) if (H&1) return false;
            }
        }
        return !bRequireEscapeRay;
    }
    bool OrientCrossing(const FPolygon& Polygon, int32 TriangleIndex, double& Sign) const
    {
        if (!Triangles.IsValidIndex(TriangleIndex)) return false;
        const auto& T=Triangles[TriangleIndex];
        const FVector B[3]={Points[T.X],Points[T.Y],Points[T.Z]};
        bool bCrossing=false;
        for (int32 I=1; I+1<Polygon.Num(); ++I)
        {
            const FVector A[3]={Polygon[0],Polygon[I],Polygon[I+1]};
            bCrossing |= TriangleDistanceSq(A,B)<=1.e-12;
        }
        if (!bCrossing) return false;
        const FVector Normal=FVector::CrossProduct(B[1]-B[0],B[2]-B[0]).GetSafeNormal();
        if (Normal.IsNearlyZero()) return false;
        const FVector Center=(B[0]+B[1]+B[2])/3.;
        const bool PlusOutside=Outside(Center+Normal*.05);
        const bool MinusOutside=Outside(Center-Normal*.05);
        if (PlusOutside==MinusOutside) return false;
        Sign=PlusOutside ? 1. : -1.;
        return true;
    }
    bool Near(int32 Index,const FVector* A,const FBox& Box,double PaddingSq,int32* ContactTriangle=nullptr) const
    {
        const auto& N=Nodes[Index];if(!N.Bounds.Intersect(Box))return false;
        if(N.Left!=INDEX_NONE)return Near(N.Left,A,Box,PaddingSq,ContactTriangle)||Near(N.Right,A,Box,PaddingSq,ContactTriangle);
        for(int32 I=N.Begin;I<N.End;++I)
        {
            const int32 TI=Order[I];if(!Bounds[TI].Intersect(Box))continue;
            const auto& T=Triangles[TI];const FVector B[3]={Points[T.X],Points[T.Y],Points[T.Z]};
            for(int32 K=0;K<3;++K)
            {
                double Distance=0.;bool Ambiguous=false;
                if(RayTriangle(A[K],A[(K+1)%3]-A[K],B,Distance,Ambiguous)&&Distance<=1.){if(ContactTriangle)*ContactTriangle=TI;return true;}
                if(RayTriangle(B[K],B[(K+1)%3]-B[K],A,Distance,Ambiguous)&&Distance<=1.){if(ContactTriangle)*ContactTriangle=TI;return true;}
                if((A[K]-ClosestTriangle(A[K],B[0],B[1],B[2])).SizeSquared()<=PaddingSq ||
                   (B[K]-ClosestTriangle(B[K],A[0],A[1],A[2])).SizeSquared()<=PaddingSq){if(ContactTriangle)*ContactTriangle=TI;return true;}
                for(int32 J=0;J<3;++J)if(SegmentDistanceSq(A[K],A[(K+1)%3],B[J],B[(J+1)%3])<=PaddingSq){if(ContactTriangle)*ContactTriangle=TI;return true;}
            }
        }
        return false;
    }
    bool NearCapsule(int32 Index, const FVector& Start, const FVector& End, const FBox& Box, double RadiusSq,
        int32* ContactTriangle = nullptr) const
    {
        const FNode& Node = Nodes[Index];
        if (!Node.Bounds.Intersect(Box)) return false;
        if (Node.Left != INDEX_NONE)
            return NearCapsule(Node.Left, Start, End, Box, RadiusSq, ContactTriangle) ||
                NearCapsule(Node.Right, Start, End, Box, RadiusSq, ContactTriangle);
        for (int32 I = Node.Begin; I < Node.End; ++I)
        {
            const int32 TriangleIndex = Order[I];
            if (!Bounds[TriangleIndex].Intersect(Box)) continue;
            const FIntVector& T = Triangles[TriangleIndex];
            const FVector Triangle[3] = {Points[T.X], Points[T.Y], Points[T.Z]};
            const double DistanceSq = SegmentTriangleDistanceSq(Start, End, Triangle);
            if (!FMath::IsFinite(DistanceSq) || DistanceSq <= RadiusSq)
            {
                if (ContactTriangle) *ContactTriangle = TriangleIndex;
                return true;
            }
        }
        return false;
    }
    // A bounded contact manifold for correction only. NearCapsule remains the
    // independent complete rejection test; exhausting this budget grants no clearance.
    void CapsuleContacts(int32 Index, const FVector& Start, const FVector& End,
        const FBox& Box, double Radius, int32& Remaining,
        TArray<TPair<double,int32>>& Contacts) const
    {
        const FNode& Node = Nodes[Index];
        if (Remaining <= 0 || !Node.Bounds.Intersect(Box)) return;
        if (Node.Left != INDEX_NONE)
        {
            CapsuleContacts(Node.Left,Start,End,Box,Radius,Remaining,Contacts);
            CapsuleContacts(Node.Right,Start,End,Box,Radius,Remaining,Contacts);
            return;
        }
        for (int32 I=Node.Begin; I<Node.End && Remaining>0; ++I)
        {
            const int32 TriangleIndex=Order[I];
            if (!Bounds[TriangleIndex].Intersect(Box)) continue;
            --Remaining;
            const auto& T=Triangles[TriangleIndex];
            const FVector Triangle[3]={Points[T.X],Points[T.Y],Points[T.Z]};
            const double DistanceSq=SegmentTriangleDistanceSq(Start,End,Triangle);
            if (!FMath::IsFinite(DistanceSq) || DistanceSq>Radius*Radius) continue;
            const double Depth=Radius-FMath::Sqrt(DistanceSq)+
                (DistanceSq<=1.e-16 ? SegmentTriangleCrossingExitDepth(Start,End,Triangle) : 0.);
            Contacts.Emplace(Depth,TriangleIndex);
            Contacts.Sort([](const auto& A,const auto& B){return A.Key>B.Key;});
            if (Contacts.Num()>16) Contacts.SetNum(16,EAllowShrinking::No);
        }
    }
    bool NearTree(int32 Index,const FSurfaceTree& Other,int32 OtherIndex,double Padding,
        int32* LeftContact=nullptr,int32* RightContact=nullptr) const
    {
        const auto& A=Nodes[Index];const auto& B=Other.Nodes[OtherIndex];
        if(!A.Bounds.ExpandBy(Padding).Intersect(B.Bounds))return false;
        if(A.Left!=INDEX_NONE && (B.Left==INDEX_NONE || A.End-A.Begin>=B.End-B.Begin))
            return NearTree(A.Left,Other,OtherIndex,Padding,LeftContact,RightContact)||
                NearTree(A.Right,Other,OtherIndex,Padding,LeftContact,RightContact);
        if(B.Left!=INDEX_NONE)
            return NearTree(Index,Other,B.Left,Padding,LeftContact,RightContact)||
                NearTree(Index,Other,B.Right,Padding,LeftContact,RightContact);
        for(int32 I=A.Begin;I<A.End;++I)
        {
            const int32 TI=Order[I];const auto& T=Triangles[TI];
            const FVector V[3]={Points[T.X],Points[T.Y],Points[T.Z]};
            int32 OtherTriangle=INDEX_NONE;
            if(Other.Near(OtherIndex,V,Bounds[TI].ExpandBy(Padding),Padding*Padding,
                RightContact?&OtherTriangle:nullptr))
            {
                if(LeftContact)*LeftContact=TI;
                if(RightContact)*RightContact=OtherTriangle;
                return true;
            }
        }
        return false;
    }
    // Search guidance only: retain simultaneous contacts instead of following
    // whichever triangle happens to be visited first by the certificate BVH.
    void CollectTreeContacts(int32 Index,const FSurfaceTree& Other,int32 OtherIndex,double Padding,
        TArray<TPair<double,FIntPoint>>& Contacts) const
    {
        const auto& A=Nodes[Index]; const auto& B=Other.Nodes[OtherIndex];
        if(!A.Bounds.ExpandBy(Padding).Intersect(B.Bounds)) return;
        if(A.Left!=INDEX_NONE && (B.Left==INDEX_NONE || A.End-A.Begin>=B.End-B.Begin))
        {
            CollectTreeContacts(A.Left,Other,OtherIndex,Padding,Contacts);
            CollectTreeContacts(A.Right,Other,OtherIndex,Padding,Contacts);
            return;
        }
        if(B.Left!=INDEX_NONE)
        {
            CollectTreeContacts(Index,Other,B.Left,Padding,Contacts);
            CollectTreeContacts(Index,Other,B.Right,Padding,Contacts);
            return;
        }
        for(int32 I=A.Begin;I<A.End;++I) for(int32 J=B.Begin;J<B.End;++J)
        {
            const int32 L=Order[I], R=Other.Order[J];
            if(!Bounds[L].ExpandBy(Padding).Intersect(Other.Bounds[R])) continue;
            const auto& LT=Triangles[L]; const auto& RT=Other.Triangles[R];
            const FVector LP[3]={Points[LT.X],Points[LT.Y],Points[LT.Z]};
            const FVector RP[3]={Other.Points[RT.X],Other.Points[RT.Y],Other.Points[RT.Z]};
            const double D=TriangleDistanceSq(LP,RP);
            if(!FMath::IsFinite(D) || D>Padding*Padding) continue;
            const double Depth=Padding-FMath::Sqrt(D)+
                (D<=1.e-16 ? TriangleCrossingExitDepth(LP,RP) : 0.);
            Contacts.Emplace(Depth,FIntPoint(L,R));
            Contacts.Sort([](const auto& X,const auto& Y){return X.Key>Y.Key;});
            if(Contacts.Num()>32) Contacts.SetNum(32,EAllowShrinking::No);
        }
    }
    void Nearest(int32 Index,const FVector& Point,double& BestSq,int32& BestTriangle,FVector& Closest) const
    {
        const auto& Node=Nodes[Index];
        if(Node.Bounds.ComputeSquaredDistanceToPoint(Point)>BestSq)return;
        if(Node.Left!=INDEX_NONE)
        {
            const bool LeftFirst=Nodes[Node.Left].Bounds.ComputeSquaredDistanceToPoint(Point)<=
                Nodes[Node.Right].Bounds.ComputeSquaredDistanceToPoint(Point);
            Nearest(LeftFirst?Node.Left:Node.Right,Point,BestSq,BestTriangle,Closest);
            Nearest(LeftFirst?Node.Right:Node.Left,Point,BestSq,BestTriangle,Closest);
            return;
        }
        for(int32 I=Node.Begin;I<Node.End;++I)
        {
            const int32 TI=Order[I];const auto& T=Triangles[TI];
            if(FVector::CrossProduct(Points[T.Y]-Points[T.X],Points[T.Z]-Points[T.X]).IsNearlyZero())continue;
            const FVector Candidate=ClosestTriangle(Point,Points[T.X],Points[T.Y],Points[T.Z]);
            const double DistanceSq=(Candidate-Point).SizeSquared();
            if(DistanceSq<BestSq){BestSq=DistanceSq;BestTriangle=TI;Closest=Candidate;}
        }
    }
    bool Clear(const FPolygon& Polygon,double Padding,const FSurfaceTree& Containment,int32* FailureReason=nullptr,
        int32* ContactTriangle=nullptr,bool* bContactClosedBody=nullptr,double* EscapeNormalSign=nullptr) const
    {
        if(Nodes.IsEmpty()||Polygon.Num()<3)return false;
        for(int32 I=1;I+1<Polygon.Num();++I)
        {
            const FVector Triangle[3]={Polygon[0],Polygon[I],Polygon[I+1]};
            FBox Box(ForceInit);for(const auto& V:Triangle)Box+=V;
            if(Near(0,Triangle,Box.ExpandBy(Padding),Padding*Padding,ContactTriangle))
            {if(FailureReason)*FailureReason=1;if(bContactClosedBody)*bContactClosedBody=&Containment==this;return false;}
            // The closed region also contains shoulder surfaces omitted by torso-only
            // distance tests. An edge can cross them while its triangle centroid is outside.
            if(&Containment != this && Containment.Near(0,Triangle,Box.ExpandBy(Padding),Padding*Padding,ContactTriangle))
            {if(FailureReason)*FailureReason=2;if(bContactClosedBody)*bContactClosedBody=true;return false;}
            const FVector Centroid=(Triangle[0]+Triangle[1]+Triangle[2])/3.;
            if(!Containment.Outside(Centroid))
            {
                if(FailureReason)*FailureReason=3;
                // Containment (including ambiguous rays) still rejects unconditionally.
                // Only a query requesting witnesses pays for the nearest-surface search.
                if(ContactTriangle && EscapeNormalSign)
                {
                    double BestSq=TNumericLimits<double>::Max();int32 Best=INDEX_NONE;FVector Closest;
                    Containment.Nearest(0,Centroid,BestSq,Best,Closest);
                    if(Best!=INDEX_NONE)
                    {
                        const auto& T=Containment.Triangles[Best];
                        const FVector Normal=FVector::CrossProduct(Containment.Points[T.Y]-Containment.Points[T.X],
                            Containment.Points[T.Z]-Containment.Points[T.X]).GetSafeNormal();
                        const double Direction=FVector::DotProduct(Normal,Closest-Centroid);
                        if(FMath::Abs(Direction)>1.e-10)
                        {
                            *ContactTriangle=Best;*EscapeNormalSign=Direction>0.?1.:-1.;
                            if(bContactClosedBody)*bContactClosedBody=true;
                        }
                    }
                }
                return false;
            }
        }
        return true;
    }
};


// Build a closed oriented region without dropping any selected triangle. UV/material
// duplicates have already been welded only when all normalized influences agree.
bool CloseArmRegion(TArray<FIntVector>& Triangles,const TArray<int32>& Weld,
    const TArray<FVector>& Points,TArray<int32>& Components,TArray<int32>& Witnesses,FString* Failure=nullptr)
{
    const auto Fail=[&](const TCHAR* Reason){if(Failure)*Failure=Reason;return false;};
    struct FEdge {int32 A,B,Triangle,Count,Other=INDEX_NONE;};
    TMap<uint64,FEdge> Edges;
    TArray<int32> Parent;for(int32 I=0;I<Triangles.Num();++I)Parent.Add(I);
    const auto Find=[&](int32 X){while(Parent[X]!=X)X=Parent[X];return X;};
    if(Triangles.IsEmpty())return Fail(TEXT("empty region"));
    for(int32 I=0;I<Triangles.Num();++I)
    {
        auto& T=Triangles[I];for(int32 K=0;K<3;++K)T[K]=Weld[T[K]];
        if(T.X==T.Y||T.Y==T.Z||T.Z==T.X)return Fail(TEXT("weld collapses an original face"));
        for(int32 K=0;K<3;++K)
        {
            const int32 A=T[K],B=T[(K+1)%3];const uint64 Key=(uint64(FMath::Min(A,B))<<32)|uint32(FMath::Max(A,B));
            auto* E=Edges.Find(Key);
            if(!E)Edges.Add(Key,{A,B,I,1});
            else{if(E->Count!=1||E->A!=B||E->B!=A)return Fail(TEXT("original edge nonmanifold or inconsistently oriented"));E->Count=2;E->Other=I;Parent[Find(I)]=Find(E->Triangle);}
        }
    }
    TMap<int32,int32> Ids;
    for(int32 I=0;I<Parent.Num();++I)
    {
        const int32 Root=Find(I);
        if(!Ids.Contains(Root)){Ids.Add(Root,Ids.Num());Witnesses.Add(I);}
        Components.Add(Ids[Root]);
    }
    if(Ids.Num()>128)return Fail(TEXT("more than 128 edge components"));
    // A manifold edge surface may have multiple boundary fans touching at a vertex.
    // Follow adjacent oriented faces around that vertex, rather than picking an
    // arbitrary outgoing boundary edge (or rejecting a valid pinched boundary).
    const auto EdgeKey=[](int32 A,int32 B){return (uint64(FMath::Min(A,B))<<32)|uint32(FMath::Max(A,B));};
    TSet<uint64> Boundary,ForbiddenDiagonals;
    for(const auto& Pair:Edges)
        if(Pair.Value.Count==1)Boundary.Add(Pair.Key);else ForbiddenDiagonals.Add(Pair.Key);
    TArray<FIntVector> AllCaps;
    TArray<int32> CapComponents;
    while(!Boundary.IsEmpty())
    {
        const uint64 Start=*Boundary.CreateConstIterator();uint64 At=Start;
        TArray<int32> Loop;int32 Component=INDEX_NONE;
        do
        {
            if(!Boundary.Remove(At))return false;
            const FEdge& Edge=Edges[At];Loop.Add(Edge.A);
            if(Component==INDEX_NONE)Component=Components[Edge.Triangle];
            else if(Component!=Components[Edge.Triangle])return false;
            int32 Face=Edge.Triangle;bool Found=false;
            for(int32 Step=0;Step<Triangles.Num();++Step)
            {
                const FIntVector& T=Triangles[Face];int32 K=0;
                while(K<3&&T[K]!=Edge.B)++K;
                if(K==3)return false;
                const uint64 NextKey=EdgeKey(Edge.B,T[(K+1)%3]);
                const FEdge& Next=Edges[NextKey];
                if(Next.Count==1){At=NextKey;Found=true;break;}
                Face=Next.Triangle==Face?Next.Other:Next.Triangle;
                if(Face==INDEX_NONE)return false;
            }
            if(!Found)return false;
        }while(At!=Start&&Loop.Num()<=4096);
        TArray<FIntVector> ExistingFaces=Triangles;ExistingFaces.Append(AllCaps);
        TArray<FIntVector> Caps;if(Loop.Num()>4096||!CapBoundaryWalk(Loop,Points,Caps,&ForbiddenDiagonals,&ExistingFaces))
        {
            UE_LOG(LogFlowArtsSkin, Verbose, TEXT("Closed-body cap rejected: walk vertices=%d component=%d already capped=%d"),
                Loop.Num(), Component, AllCaps.Num());
            return Fail(TEXT("boundary cannot be triangulated in a simple projection"));
        }
        AllCaps.Append(Caps);for(int32 I=0;I<Caps.Num();++I)CapComponents.Add(Component);
        // Later boundary caps cannot introduce a second pair of faces on an
        // already capped diagonal. Original boundary edges are unaffected.
        for(const FIntVector& T:Caps)for(int32 K=0;K<3;++K)
        {
            const uint64 Key=EdgeKey(T[K],T[(K+1)%3]);
            if(!Edges.Contains(Key))ForbiddenDiagonals.Add(Key);
        }
    }
    if(!CapsDoNotIntersect(Triangles,AllCaps,Points,true))
        return Fail(TEXT("cap intersects another cap or an original face"));
    Triangles.Append(AllCaps);Components.Append(CapComponents);
    // Check every original/cap edge again: incomplete or inconsistent caps never enable a waiver.
    TMap<uint64,FEdge> ClosedEdges;
    for(const auto& T:Triangles)for(int32 K=0;K<3;++K)
    {
        const int32 A=T[K],B=T[(K+1)%3];const uint64 Key=(uint64(FMath::Min(A,B))<<32)|uint32(FMath::Max(A,B));
        auto* E=ClosedEdges.Find(Key);
        if(!E)ClosedEdges.Add(Key,{A,B,0,1});
        else{if(E->Count!=1||E->A!=B||E->B!=A)return Fail(TEXT("cap edge duplicates an existing edge or inconsistent orientation"));E->Count=2;}
    }
    for(const auto& E:ClosedEdges)if(E.Value.Count!=2)return Fail(TEXT("unpaired edge after capping"));
    return true;
}

bool ArmPairClear(const FSurfaceTree& Left,const FSurfaceTree& Right,
    const TArray<int32>& LeftWitnesses,const TArray<int32>& RightWitnesses,double Padding,
    uint8* FailureReason=nullptr,int32* LeftContact=nullptr,int32* RightContact=nullptr)
{
    if(FailureReason)*FailureReason=1;
    if(Left.Nodes.IsEmpty()||Right.Nodes.IsEmpty()||LeftWitnesses.Num()!=Left.ComponentCount||
        RightWitnesses.Num()!=Right.ComponentCount||LeftWitnesses.IsEmpty()||RightWitnesses.IsEmpty())return false;
    if(FailureReason)*FailureReason=2;
    if(Left.NearTree(0,Right,0,Padding,LeftContact,RightContact))return false;
    // With every surface pair separated, a connected closed component cannot change
    // containment without crossing the other surface. Test one witness in BOTH directions
    // for each component (including disconnected fingers/clothing), using conservative rays.
    const auto OutsideAll=[](const FSurfaceTree& Surface,const TArray<int32>& Witnesses,const FSurfaceTree& Other)
    {
        for(int32 I:Witnesses)
        {
            if(!Surface.Triangles.IsValidIndex(I))return false;
            const auto& T=Surface.Triangles[I];
            if(!Other.Outside((Surface.Points[T.X]+Surface.Points[T.Y]+Surface.Points[T.Z])/3.))return false;
        }
        return true;
    };
    if(FailureReason)*FailureReason=3;
    if(!OutsideAll(Left,LeftWitnesses,Right))return false;
    if(FailureReason)*FailureReason=4;
    if(!OutsideAll(Right,RightWitnesses,Left))return false;
    if(FailureReason)*FailureReason=0;
    return true;
}

bool ArmPropsClear(const FSurfaceTree& Arm, TConstArrayView<FFlowArtsClearanceCapsule> Props, double Padding,
    TArray<FFlowArtsPropContactWitness>* Witnesses = nullptr, uint8 SurfaceKind = 0,
    uint8 SurfaceSide = 0, uint8 PropSide = 0)
{
    if (Arm.Nodes.IsEmpty() || Arm.ComponentCount < 1 || Arm.ComponentCount > 128 ||
        !Arm.Components || Arm.Components->Num() != Arm.Triangles.Num() || Props.IsEmpty() || Props.Num() > 16)
        return false;
    for (int32 PropIndex = 0; PropIndex < Props.Num(); ++PropIndex)
    {
        const FFlowArtsClearanceCapsule& Prop = Props[PropIndex];
        if (Prop.Start.ContainsNaN() || Prop.End.ContainsNaN() ||
            !FMath::IsFinite(Prop.RadiusCm) || Prop.RadiusCm <= 0.f) return false;
        const double Radius = double(Prop.RadiusCm) + Padding;
        FBox Bounds(ForceInit); Bounds += Prop.Start; Bounds += Prop.End;
        int32 ContactTriangle = INDEX_NONE;
        if (Arm.NearCapsule(0, Prop.Start, Prop.End, Bounds.ExpandBy(Radius), Radius * Radius,
            Witnesses ? &ContactTriangle : nullptr))
        {
            if (Witnesses && ContactTriangle != INDEX_NONE)
            {
                Witnesses->Add({SurfaceKind, SurfaceSide, PropSide, ContactTriangle, PropIndex});
                if (SurfaceKind == 0)
                {
                    int32 Remaining=512;
                    TArray<TPair<double,int32>> Contacts;
                    Arm.CapsuleContacts(0,Prop.Start,Prop.End,Bounds.ExpandBy(Radius),Radius,Remaining,Contacts);
                    for (const auto& Contact : Contacts)
                        if (Contact.Value != ContactTriangle)
                            Witnesses->Add({SurfaceKind,SurfaceSide,PropSide,Contact.Value,PropIndex});
                }
                const FIntVector& T = Arm.Triangles[ContactTriangle];
                const FVector Triangle[3] = {Arm.Points[T.X], Arm.Points[T.Y], Arm.Points[T.Z]};
                UE_LOG(LogFlowArtsSkin, VeryVerbose,
                    TEXT("Prop exact contact kind=%u surface=%u owner=%u triangle=%d capsule=%d axisDistance=%.9g paddedRadius=%.9g tri0=%s tri1=%s tri2=%s axis0=%s axis1=%s"),
                    SurfaceKind, SurfaceSide, PropSide, ContactTriangle, PropIndex,
                    FMath::Sqrt(SegmentTriangleDistanceSq(Prop.Start, Prop.End, Triangle)), Radius,
                    *Triangle[0].ToString(), *Triangle[1].ToString(), *Triangle[2].ToString(),
                    *Prop.Start.ToString(), *Prop.End.ToString());
            }
            return false;
        }
        // No arm boundary enters the padded capsule. An arm component fully inside
        // it would already fail that distance test. The remaining containment case
        // is the connected capsule wholly inside an arm component: its axis start
        // must be outside every closed component. Ambiguous rays reject as usual.
        if (!Arm.Outside(Prop.Start))
        {
            if (Witnesses)
            {
                double Nearest = TNumericLimits<double>::Max();
                int32 NearestIndex = INDEX_NONE;
                double Sign = 1.;
                for (int32 I = 0; I < Arm.Triangles.Num(); ++I)
                {
                    const FIntVector& T = Arm.Triangles[I];
                    const FVector A = Arm.Points[T.X], B = Arm.Points[T.Y], C = Arm.Points[T.Z];
                    const FVector Near = ClosestTriangle(Prop.Start, A, B, C);
                    const double Distance = (Near - Prop.Start).SizeSquared();
                    if (Distance < Nearest)
                    {
                        Nearest = Distance; NearestIndex = I;
                        Sign = FVector::DotProduct(FVector::CrossProduct(B-A,C-A), Near-Prop.Start) >= 0. ? 1. : -1.;
                    }
                }
                if (NearestIndex != INDEX_NONE)
                    Witnesses->Add({SurfaceKind, SurfaceSide, PropSide, NearestIndex, PropIndex, true, Sign});
            }
            return false;
        }
    }
    return true;
}

}

uint8 FFlowArtsSkinnedClearance::HeadOrNeckAncestryMask(TConstArrayView<int32> Parents,
    int32 Bone, int32 NeckBone, int32 HeadBone)
{
    if (!Parents.IsValidIndex(Bone) || !Parents.IsValidIndex(NeckBone) ||
        !Parents.IsValidIndex(HeadBone)) return 0;
    uint8 Mask = 0;
    int32 At = Bone;
    for (int32 Depth = 0; At != INDEX_NONE && Depth < Parents.Num(); ++Depth)
    {
        if (!Parents.IsValidIndex(At)) return 0;
        if (At == NeckBone) Mask |= 1;
        if (At == HeadBone) Mask |= 2;
        At = Parents[At];
    }
    return At == INDEX_NONE ? Mask : 0;
}

bool FFlowArtsSkinnedClearance::Build(const USkeletalMesh* Mesh,
    FFlowArtsSkinnedClearanceData& Out, FString& Error)
{
    check(IsInGameThread());
    Error.Reset();
    const auto Fail = [&](const TCHAR* Message) { Error = Message; return false; };
    if (!Mesh) return Fail(TEXT("No mesh for weighted clearance"));
    const FSkeletalMeshRenderData* RenderData = Mesh->GetResourceForRendering();
    if (!RenderData || RenderData->LODRenderData.IsEmpty()) return Fail(TEXT("No LOD0 render data"));
    const auto& LOD = RenderData->LODRenderData[0];
    const auto& Positions = LOD.StaticVertexBuffers.PositionVertexBuffer;
    const auto* Weights = LOD.GetSkinWeightVertexBuffer();
    if (!Weights || !Positions.GetAllowCPUAccess() || !Positions.GetVertexData() ||
        !Weights->GetNeedsCPUAccess() || !Weights->GetDataVertexBuffer()->GetWeightData() ||
        !LOD.MultiSizeIndexContainer.IsIndexBufferValid() ||
        !LOD.MultiSizeIndexContainer.GetIndexBuffer()->GetNeedsCPUAccess())
        return Fail(TEXT("Weighted clearance needs CPU positions, weights and indices"));
    const auto* Indices = LOD.MultiSizeIndexContainer.GetIndexBuffer();
    if (Positions.GetNumVertices() != Weights->GetNumVertices() || Positions.GetNumVertices() > 100000 ||
        Indices->Num() <= 0 || Indices->Num() > 600000 || Indices->Num() % 3 != 0)
        return Fail(TEXT("Invalid or oversized weighted clearance LOD"));
    const auto& Ref = Mesh->GetRefSkeleton();
    TArray<FTransform> Bind;
    for (int32 I = 0; I < Ref.GetNum(); ++I)
    {
        FTransform Transform = Ref.GetRefBonePose()[I];
        if (Ref.GetParentIndex(I) != INDEX_NONE) Transform = Transform * Bind[Ref.GetParentIndex(I)];
        Bind.Add(Transform);
    }
    const int32 Hip = Ref.FindBoneIndex(TEXT("Hips")), Neck = Ref.FindBoneIndex(TEXT("Neck"));
    const int32 HeadBone = Ref.FindBoneIndex(TEXT("Head"));
    const int32 Upper[2] = {Ref.FindBoneIndex(TEXT("LeftArm")), Ref.FindBoneIndex(TEXT("RightArm"))};
    const int32 Elbow[2] = {Ref.FindBoneIndex(TEXT("LeftForeArm")), Ref.FindBoneIndex(TEXT("RightForeArm"))};
    if (Hip == INDEX_NONE || Neck == INDEX_NONE || HeadBone == INDEX_NONE ||
        Upper[0] == INDEX_NONE || Upper[1] == INDEX_NONE ||
        Elbow[0] == INDEX_NONE || Elbow[1] == INDEX_NONE) return Fail(TEXT("Missing weighted clearance bones"));
    const FVector Trunk = Bind[Neck].GetLocation() - Bind[Hip].GetLocation();
    if (Trunk.SizeSquared() < SMALL_NUMBER) return Fail(TEXT("Degenerate weighted torso"));
    FFlowArtsSkinnedClearanceData Cache; Cache.ReferenceBoneCount = Ref.GetNum();
    for (int32 I = 0; I < Ref.GetNum(); ++I) Cache.ReferenceBoneNames.Add(Ref.GetBoneName(I));
    Cache.Vertices.SetNum(Positions.GetNumVertices());
    TArray<int32> Dominant; Dominant.Init(INDEX_NONE, Positions.GetNumVertices());
    TArray<float> TrunkFraction; TrunkFraction.SetNum(Positions.GetNumVertices());
    TArray<FVector> ArmFraction; ArmFraction.SetNum(Positions.GetNumVertices());
    const TConstArrayView<FBoneIndexType> UnifiedMap = LOD.GetUnifiedBoneMap();
    for (const auto& Section : LOD.RenderSections)
    {
        const TConstArrayView<FBoneIndexType> Map = LOD.HasUnifiedBoneMap() ? UnifiedMap : TConstArrayView<FBoneIndexType>(Section.BoneMap);
        const uint32 End = FMath::Min(Section.BaseVertexIndex + Section.NumVertices, Positions.GetNumVertices());
        for (uint32 V = Section.BaseVertexIndex; V < End; ++V)
        {
            auto& Vertex = Cache.Vertices[V];
            if (Vertex.InfluenceCount) return Fail(TEXT("Overlapping weighted vertex sections"));
            const FVector Point(Positions.VertexPosition(V));
            TrunkFraction[V] = FVector::DotProduct(Point - Bind[Hip].GetLocation(), Trunk) / Trunk.SizeSquared();
            for (int32 Side = 0; Side < 2; ++Side)
            {
                const FVector Axis = Bind[Elbow[Side]].GetLocation() - Bind[Upper[Side]].GetLocation();
                if (Axis.SizeSquared() < SMALL_NUMBER) return Fail(TEXT("Degenerate weighted arm"));
                ArmFraction[V][Side] = FVector::DotProduct(Point - Bind[Upper[Side]].GetLocation(), Axis) / Axis.SizeSquared();
            }
            uint32 Offset = 0, Count = 0; Weights->GetVertexInfluenceOffsetCount(V, Offset, Count);
            if (Count > 32) return Fail(TEXT("Too many weighted vertex influences"));
            Vertex.FirstInfluence = Cache.Influences.Num();
            float Total = 0.f, Largest = -1.f;
            for (uint32 I = 0; I < Count; ++I)
            {
                const uint16 Weight = Weights->GetBoneWeight(V, I);
                if (!Weight) continue;
                const int32 Mapped = Weights->GetBoneIndex(V, I);
                if (!Map.IsValidIndex(Mapped) || !Bind.IsValidIndex(Map[Mapped])) return Fail(TEXT("Invalid weighted bone map"));
                const int32 Bone = Map[Mapped];
                Cache.Influences.Add({Bone, Bind[Bone].InverseTransformPosition(Point), static_cast<float>(Weight)});
                Total += Weight;
                if (Weight > Largest) { Largest = Weight; Dominant[V] = Bone; }
            }
            Vertex.InfluenceCount = Cache.Influences.Num() - Vertex.FirstInfluence;
            if (!Vertex.InfluenceCount || Total <= 0.f) return Fail(TEXT("Unweighted clearance vertex"));
            for (int32 I = Vertex.FirstInfluence; I < Cache.Influences.Num(); ++I) Cache.Influences[I].Weight /= Total;
        }
    }
    TArray<FVector> BindPoints;
    for(uint32 V=0;V<Positions.GetNumVertices();++V)BindPoints.Add(FVector(Positions.VertexPosition(V)));
    TArray<int8> ArmSide;ArmSide.Init(-1,Ref.GetNum());
    Cache.HeadInfluenceBone = Neck;
    Cache.HeadInfluenceHeadBone = HeadBone;
    for (int32 Side = 0; Side < 2; ++Side)
    { Cache.UncappedArmBone[Side] = Upper[Side]; Cache.DistalArmBone[Side] = Elbow[Side]; }
    TArray<uint8> RegionWeight; RegionWeight.Init(0, Ref.GetNum());
    TArray<int32> LowerRegionForBone; LowerRegionForBone.Init(INDEX_NONE,Ref.GetNum());
    for (const TCHAR* Name : {TEXT("LeftUpLeg"),TEXT("LeftLeg"),TEXT("LeftFoot"),
        TEXT("RightUpLeg"),TEXT("RightLeg"),TEXT("RightFoot")})
    {
        const int32 Bone=Ref.FindBoneIndex(Name);
        if (Bone==INDEX_NONE) continue;
        FFlowArtsSkinnedClearanceData::FLowerBodyRegion Region; Region.Bone=Bone;
        const int32 Index=Cache.LowerBodyRegions.Add(MoveTemp(Region));
        LowerRegionForBone[Bone]=Index;
    }
    for (int32 Bone=0; Bone<Ref.GetNum(); ++Bone)
        if (LowerRegionForBone[Bone]==INDEX_NONE)
            for (int32 At=Ref.GetParentIndex(Bone); At!=INDEX_NONE; At=Ref.GetParentIndex(At))
                if (LowerRegionForBone[At]!=INDEX_NONE)
                { LowerRegionForBone[Bone]=LowerRegionForBone[At]; break; }
    const int32 HandBones[2] = {Ref.FindBoneIndex(TEXT("LeftHand")), Ref.FindBoneIndex(TEXT("RightHand"))};
    TArray<int32> ParentIndices;
    ParentIndices.Reserve(Ref.GetNum());
    for (int32 Bone = 0; Bone < Ref.GetNum(); ++Bone)
        ParentIndices.Add(Ref.GetParentIndex(Bone));
    TArray<uint8> HeadOrNeckWeight;
    HeadOrNeckWeight.SetNumZeroed(Ref.GetNum());
    for (int32 Bone = 0; Bone < Ref.GetNum(); ++Bone)
        HeadOrNeckWeight[Bone] = HeadOrNeckAncestryMask(ParentIndices, Bone, Neck, HeadBone);
    for (int32 Bone = 0; Bone < Ref.GetNum(); ++Bone)
        for (int32 At = Bone; At != INDEX_NONE; At = Ref.GetParentIndex(At))
        {
            for (int32 Side = 0; Side < 2; ++Side)
            {
                if (At == Upper[Side]) RegionWeight[Bone] |= uint8(1 << Side);
                if (At == Elbow[Side]) RegionWeight[Bone] |= uint8(4 << Side);
                if (At == HandBones[Side]) RegionWeight[Bone] |= uint8(32 << Side);
            }
        }
    for(int32 Bone=0;Bone<Ref.GetNum();++Bone)
        for(int32 At=Bone;At!=INDEX_NONE;At=Ref.GetParentIndex(At))
            for(int32 Side=0;Side<2;++Side)if(At==Upper[Side])ArmSide[Bone]=Side;
    TArray<TSet<int32>> Supports; Supports.SetNum(BandCount);
    bool bSawHeadWeightedFace = false;
    for (int32 T = 0; T < Indices->Num(); T += 3)
    {
        const FIntVector Triangle(Indices->Get(T), Indices->Get(T + 1), Indices->Get(T + 2));
        for (int32 I = 0; I < 3; ++I)
            if (!Cache.Vertices.IsValidIndex(Triangle[I]) || !Cache.Vertices[Triangle[I]].InfluenceCount)
                return Fail(TEXT("Invalid weighted triangle"));
        uint8 InfluencedRegions = 0;
        uint8 HeadOrNeckTouched = 0;
        uint8 LowerRegions=0;
        for (int32 Corner = 0; Corner < 3; ++Corner)
        {
            const auto& Vertex = Cache.Vertices[Triangle[Corner]];
            for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
                if (Cache.Influences[I].Weight > 0.f)
                {
                    InfluencedRegions |= RegionWeight[Cache.Influences[I].Bone];
                    HeadOrNeckTouched |= HeadOrNeckWeight[Cache.Influences[I].Bone];
                    const int32 Lower=LowerRegionForBone[Cache.Influences[I].Bone];
                    if (Lower!=INDEX_NONE) LowerRegions|=uint8(1<<Lower);
                }
        }
        for (int32 Lower=0; Lower<Cache.LowerBodyRegions.Num(); ++Lower)
            if (LowerRegions & (1<<Lower)) Cache.LowerBodyRegions[Lower].Triangles.Add(Triangle);
        for (int32 Side = 0; Side < 2; ++Side)
        {
            if (InfluencedRegions & (1 << Side)) Cache.UncappedArmTriangles[Side].Add(Triangle);
            if (InfluencedRegions & (4 << Side)) Cache.DistalArmTriangles[Side].Add(Triangle);
        }
        if (HeadOrNeckTouched)
        {
            Cache.HeadInfluenceTriangles.Add(Triangle);
            bSawHeadWeightedFace |= (HeadOrNeckTouched & 2) != 0;
        }
        for (int32 Side = 0; Side < 2; ++Side)
        {
            bool bFullArm=false;
            for(int32 I=0;I<3;++I)if(ArmSide.IsValidIndex(Dominant[Triangle[I]]) && ArmSide[Dominant[Triangle[I]]]==Side)bFullArm=true;
            if(bFullArm)Cache.FullArmTriangles[Side].Add(Triangle);
            bool bArm = false;
            FVector Fractions;
            for (int32 I = 0; I < 3; ++I) { bArm |= Dominant[Triangle[I]] == Upper[Side]; Fractions[I] = ArmFraction[Triangle[I]][Side]; }
            if (bArm && Fractions.GetMax() >= .23 && Fractions.GetMin() <= 1.) Cache.UpperTriangles[Side].Add({Triangle, Fractions});
        }
        bool bTorso = false;
        float Min = 100.f, Max = -100.f;
        for (int32 I = 0; I < 3; ++I)
        {
            const int32 Bone = Dominant[Triangle[I]];
            bTorso |= Bone == Hip || (Bone != INDEX_NONE && Ref.GetBoneName(Bone).ToString().StartsWith(TEXT("Spine")));
            Min = FMath::Min(Min, TrunkFraction[Triangle[I]]); Max = FMath::Max(Max, TrunkFraction[Triangle[I]]);
        }
        bool bAllTorso = true;
        for (int32 I = 0; I < 3; ++I)
        {
            const int32 Bone = Dominant[Triangle[I]];
            bAllTorso &= Bone == Hip || (Bone != INDEX_NONE && Ref.GetBoneName(Bone).ToString().StartsWith(TEXT("Spine")));
        }
        if (bAllTorso) Cache.TorsoTriangles.Add(Triangle);
        if (bTorso) Cache.BodyPropBoundaryTriangles.Add(Triangle);
        bool bBody=true;
        for(int32 I=0;I<3;++I)
        {
            if(Dominant[Triangle[I]]==INDEX_NONE){bBody=false;break;}
            const FString Name=Ref.GetBoneName(Dominant[Triangle[I]]).ToString();
            bBody &= !Name.Contains(TEXT("Arm")) && !Name.Contains(TEXT("Hand")) && Name!=TEXT("Head") && Name!=TEXT("Neck");
        }
        if(bBody)Cache.BodyTriangles.Add(Triangle);
        if (bTorso) for (int32 Band = 0; Band < BandCount; ++Band)
        {
            const float Lo = .28f + Band * (.61f / BandCount), Hi = .28f + (Band + 1) * (.61f / BandCount);
            if (Max >= Lo && Min <= Hi) for (int32 I = 0; I < 3; ++I) Supports[Band].Add(Triangle[I]);
        }
    }
    if (Cache.UpperTriangles[0].IsEmpty() || Cache.UpperTriangles[1].IsEmpty()) return Fail(TEXT("No exposed weighted arm triangles"));
    for (int32 Band = 0; Band < BandCount; ++Band)
    {
        if (Supports[Band].Num() < 4) return Fail(TEXT("Incomplete weighted torso bands"));
        Cache.TorsoSupportVertices[Band] = Supports[Band].Array();
    }

    // Render vertices split at materials/UV seams. Weld only identical bind positions AND
    // normalized influences, so every welded point remains identical under any candidate.
    TMap<FIntVector,TArray<int32>> Buckets;
    TArray<int32> Weld;Weld.SetNum(Cache.Vertices.Num());
    for(int32 V=0;V<Cache.Vertices.Num();++V)
    {
        const FVector P=BindPoints[V]*10000.;const FIntVector Key(FMath::RoundToInt(P.X),FMath::RoundToInt(P.Y),FMath::RoundToInt(P.Z));
        auto& Bucket=Buckets.FindOrAdd(Key);int32 Representative=V;
        for(int32 W:Bucket)
        {
            const auto& A=Cache.Vertices[V];const auto& B=Cache.Vertices[W];bool Same=A.InfluenceCount==B.InfluenceCount;
            for(int32 I=0;Same&&I<A.InfluenceCount;++I)
            {
                const auto& IA=Cache.Influences[A.FirstInfluence+I];bool Found=false;
                for(int32 J=0;J<B.InfluenceCount;++J){const auto& IB=Cache.Influences[B.FirstInfluence+J];Found|=IA.Bone==IB.Bone&&FMath::Abs(IA.Weight-IB.Weight)<1.e-7f&&IA.BoneLocalPosition.Equals(IB.BoneLocalPosition,1.e-7);}
                Same&=Found;
            }
            if(Same){Representative=W;break;}
        }
        Weld[V]=Representative;if(Representative==V)Bucket.Add(V);
    }
    // Preserve the complete selected original surfaces before CloseArmRegion adds
    // synthetic caps or clears a failed region. Only these originals may enter an
    // open-cover projection certificate.
    Cache.OpenBodyBone = Hip;
    Cache.OpenBodyTriangles = Cache.BodyTriangles;
    Cache.OpenBodyPropTriangles = Cache.BodyTriangles;
    Cache.OpenBodyPropTriangles.Append(Cache.BodyPropBoundaryTriangles);
    Cache.bOpenBodyCoverComplete = FlowArtsConservativeCover::PartitionOriginalFaces(
        Cache.OpenBodyTriangles, Weld, Cache.Vertices.Num(), Cache.OpenBodyComponents);
    Cache.bOpenBodyPropCoverComplete = FlowArtsConservativeCover::PartitionOriginalFaces(
        Cache.OpenBodyPropTriangles, Weld, Cache.Vertices.Num(), Cache.OpenBodyPropComponents);
    for (int32 Side = 0; Side < 2; ++Side)
    {
        Cache.OpenArmTriangles[Side] = Cache.FullArmTriangles[Side];
        Cache.bOpenArmCoverComplete[Side] = FlowArtsConservativeCover::PartitionOriginalFaces(
            Cache.OpenArmTriangles[Side], Weld, Cache.Vertices.Num(), Cache.OpenArmComponents[Side]);
    }
    const int32 SelectedArmCounts[2]={Cache.FullArmTriangles[0].Num(),Cache.FullArmTriangles[1].Num()};
    const auto CloseInfluenceRegion = [&](const TArray<FIntVector>& Original,
        FFlowArtsSkinnedClearanceData::FClosedInfluenceRegion& Region)
    {
        Region.Triangles = Original;
        Region.OriginalTriangleCount = Original.Num();
        FString Failure;
        if (!CloseArmRegion(Region.Triangles, Weld, BindPoints,
            Region.Components, Region.Witnesses, &Failure))
        {
            UE_LOG(LogFlowArtsSkin, Verbose, TEXT("%s influence region remains conservative: %s"),
                *Mesh->GetName(), *Failure);
            Region = {};
            return;
        }
        FSurfaceTree Tree(BindPoints, Region.Triangles);
        Region.Topology.Nodes = MoveTemp(Tree.Nodes);
        Region.Topology.Order = MoveTemp(Tree.Order);
        Region.bClosureValidated = true;
    };
    for (int32 Side = 0; Side < 2; ++Side)
    {
        CloseInfluenceRegion(Cache.UncappedArmTriangles[Side], Cache.ClosedInfluenceArm[Side]);
        CloseInfluenceRegion(Cache.DistalArmTriangles[Side], Cache.ClosedInfluenceDistal[Side]);
    }
    CloseInfluenceRegion(Cache.HeadInfluenceTriangles, Cache.ClosedInfluenceHead);
    Cache.bCanCertifyArmPair=true;
    for(int32 Side=0;Side<2;++Side)
    {
        if(!CloseArmRegion(Cache.FullArmTriangles[Side],Weld,BindPoints,
            Cache.FullArmComponents[Side],Cache.FullArmWitnessTriangles[Side]))Cache.bCanCertifyArmPair=false;
        Cache.FullArmComponentCount[Side]=Cache.FullArmWitnessTriangles[Side].Num();
    }
    if(Cache.bCanCertifyArmPair)for(int32 Side=0;Side<2;++Side)
    {
        FSurfaceTree Tree(BindPoints,Cache.FullArmTriangles[Side]);
        Cache.FullArmTopology[Side].Nodes=MoveTemp(Tree.Nodes);Cache.FullArmTopology[Side].Order=MoveTemp(Tree.Order);
        for (int32 I=0; I<Cache.FullArmTriangles[Side].Num(); ++I)
        {
            const FIntVector& Triangle=Cache.FullArmTriangles[Side][I];
            bool bHand=true;
            for (int32 K=0; K<3; ++K)
                bHand &= RegionWeight.IsValidIndex(Dominant[Triangle[K]]) &&
                    !!(RegionWeight[Dominant[Triangle[K]]] & (32 << Side));
            if (bHand)
            {
                Cache.HandTriangles[Side].Add(Triangle);
                Cache.HandFullArmTriangleIndices[Side].Add(I);
            }
        }
        FSurfaceTree HandTree(BindPoints,Cache.HandTriangles[Side]);
        Cache.HandTopology[Side].Nodes=MoveTemp(HandTree.Nodes);
        Cache.HandTopology[Side].Order=MoveTemp(HandTree.Order);
    }
    else for(int32 Side=0;Side<2;++Side)
    {
        Cache.FullArmTriangles[Side].Reset();Cache.FullArmComponents[Side].Reset();
        Cache.FullArmWitnessTriangles[Side].Reset();Cache.FullArmComponentCount[Side]=0;
    }
    UE_LOG(LogFlowArtsSkin,Display,TEXT("%s complete arm pair: available=%d selected=%d/%d closed=%d/%d components=%d/%d"),
        *Mesh->GetName(),Cache.bCanCertifyArmPair,SelectedArmCounts[0],SelectedArmCounts[1],
        Cache.FullArmTriangles[0].Num(),Cache.FullArmTriangles[1].Num(),Cache.FullArmComponentCount[0],Cache.FullArmComponentCount[1]);
    // Ignore disconnected eyes, teeth and accessories: only connected body pieces containing
    // actual torso vertices define the torso containment volume.
    TArray<int32> VertexParent;for(int32 I=0;I<Cache.Vertices.Num();++I)VertexParent.Add(I);
    const auto VertexRoot=[&](int32 X){while(VertexParent[X]!=X)X=VertexParent[X];return X;};
    for(auto& T:Cache.BodyTriangles)
    {
        for(int32 K=0;K<3;++K)T[K]=Weld[T[K]];
        VertexParent[VertexRoot(T.X)]=VertexRoot(T.Y);VertexParent[VertexRoot(T.Y)]=VertexRoot(T.Z);
    }
    TSet<int32> TorsoComponents;
    for(const auto& T:Cache.TorsoTriangles)for(int32 K=0;K<3;++K)TorsoComponents.Add(VertexRoot(Weld[T[K]]));
    Cache.BodyTriangles.RemoveAll([&](const FIntVector& T){return !TorsoComponents.Contains(VertexRoot(T.X));});
    // Use the same complete oriented-edge closure as the arm regions. In
    // particular, clothing cut boundaries may share a vertex without sharing an
    // edge; each face fan must be closed independently, preserving every face.
    TArray<FIntVector> ClosedBody=Cache.BodyTriangles;
    TArray<int32> ClosedComponents,BodyWitnesses;
    FString BodyClosureFailure;
    const bool bBodyClosed=CloseArmRegion(ClosedBody,Weld,BindPoints,ClosedComponents,BodyWitnesses,&BodyClosureFailure);
    if(bBodyClosed)
    {
        Cache.BodyComponentCount=BodyWitnesses.Num();
        for(int32 I=0;I<ClosedBody.Num();++I)
        {
            if(I<Cache.BodyTriangles.Num())Cache.BodyTriangleComponents.Add(ClosedComponents[I]);
            else {Cache.BodyCapTriangles.Add(ClosedBody[I]);Cache.BodyCapComponents.Add(ClosedComponents[I]);}
        }
    }
    // The failed open core remains available as original-face evidence, but
    // never acquires closed-body containment semantics.
    UE_LOG(LogFlowArtsSkin,Display,TEXT("%s closed body: available=%d faces=%d caps=%d components=%d reason=%s"),
        *Mesh->GetName(),bBodyClosed,Cache.BodyTriangles.Num(),Cache.BodyCapTriangles.Num(),Cache.BodyComponentCount,*BodyClosureFailure);
    {
        FSurfaceTree Tree(BindPoints, Cache.TorsoTriangles);
        Cache.TorsoTopology.Nodes = MoveTemp(Tree.Nodes);
        Cache.TorsoTopology.Order = MoveTemp(Tree.Order);
    }
    if (bBodyClosed)
    {
        Cache.ClosedBodyTriangles = Cache.BodyTriangles;
        Cache.ClosedBodyTriangles.Append(Cache.BodyCapTriangles);
    }
    Cache.ClosedBodyComponents = Cache.BodyTriangleComponents;
    Cache.ClosedBodyComponents.Append(Cache.BodyCapComponents);
    // The exact closed-body check can replace the torso/support checks only when
    // every torso face is present in that closed surface after influence-safe welds.
    const auto SortedTriangle = [](FIntVector T)
    {
        if (T.X > T.Y) Swap(T.X, T.Y);
        if (T.Y > T.Z) Swap(T.Y, T.Z);
        if (T.X > T.Y) Swap(T.X, T.Y);
        return T;
    };
    TSet<FIntVector> ClosedFaces;
    for (const FIntVector& T : Cache.ClosedBodyTriangles) ClosedFaces.Add(SortedTriangle(T));
    Cache.bTorsoCoveredByClosedBody = bBodyClosed && !Cache.TorsoTriangles.IsEmpty() &&
        !Cache.ClosedBodyTriangles.IsEmpty();
    for (const FIntVector& T : Cache.TorsoTriangles)
        if (!ClosedFaces.Contains(SortedTriangle(FIntVector(Weld[T.X], Weld[T.Y], Weld[T.Z]))))
        {
            Cache.bTorsoCoveredByClosedBody = false;
            break;
        }
    // Preserve every original mixed trunk face not represented by the closed core.
    // All normalized neck/arm influences on those vertices remain in the query union.
    Cache.BodyPropBoundaryTriangles.RemoveAll([&](FIntVector T)
    {
        return ClosedFaces.Contains(SortedTriangle(FIntVector(Weld[T.X],Weld[T.Y],Weld[T.Z])));
    });
    Cache.bCanCertifyHeldPropBody = Cache.bTorsoCoveredByClosedBody && Cache.BodyComponentCount > 0;
    {
        FSurfaceTree Tree(BindPoints, Cache.BodyPropBoundaryTriangles);
        Cache.BodyPropBoundaryTopology.Nodes = MoveTemp(Tree.Nodes);
        Cache.BodyPropBoundaryTopology.Order = MoveTemp(Tree.Order);
    }
    {
        FSurfaceTree Tree(BindPoints, Cache.ClosedBodyTriangles);
        Cache.ClosedBodyTopology.Nodes = MoveTemp(Tree.Nodes);
        Cache.ClosedBodyTopology.Order = MoveTemp(Tree.Order);
    }
    // Keep original render indices while omitting vertices no query surface references.
    TSet<int32> ReferencedVertices, ReferencedBones;
    const auto AddTriangle = [&](const FIntVector& Triangle)
    {
        for (int32 K = 0; K < 3; ++K) ReferencedVertices.Add(Triangle[K]);
    };
    for (int32 Side = 0; Side < 2; ++Side)
        for (const auto& Triangle : Cache.UpperTriangles[Side]) AddTriangle(Triangle.Vertices);
    for (const auto& Triangle : Cache.TorsoTriangles) AddTriangle(Triangle);
    for (const auto& Triangle : Cache.ClosedBodyTriangles) AddTriangle(Triangle);
    for (const auto& Triangle : Cache.OpenBodyPropTriangles) AddTriangle(Triangle);
    for (int32 Side = 0; Side < 2; ++Side)
        for (const auto& Triangle : Cache.OpenArmTriangles[Side]) AddTriangle(Triangle);
    for (const auto& Triangle : Cache.BodyPropBoundaryTriangles) AddTriangle(Triangle);
    for (auto& Region : Cache.LowerBodyRegions)
    {
        TSet<int32> Unique;
        for (const FIntVector& Triangle : Region.Triangles)
        {
            AddTriangle(Triangle);
            for (int32 K=0; K<3; ++K) Unique.Add(Triangle[K]);
        }
        Region.Vertices=Unique.Array(); Region.Vertices.Sort();
    }
    for (const auto& Band : Cache.TorsoSupportVertices)
        for (int32 V : Band) ReferencedVertices.Add(V);
    const auto CollectReferences = [&](TArray<int32>& VertexIndices, TArray<int32>& BoneIndices)
    {
        VertexIndices = ReferencedVertices.Array();
        VertexIndices.Sort();
        ReferencedBones.Reset();
        for (int32 V : VertexIndices)
        {
            const auto& Vertex = Cache.Vertices[V];
            for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
                ReferencedBones.Add(Cache.Influences[I].Bone);
        }
        BoneIndices = ReferencedBones.Array();
        BoneIndices.Sort();
    };
    CollectReferences(Cache.UpperReferencedVertices, Cache.UpperReferencedBones);
    const auto CollectRegionVertices = [&](const TArray<FIntVector>& Triangles, TArray<int32>& RegionVertices)
    {
        TSet<int32> Unique;
        for (const FIntVector& Triangle : Triangles)
            for (int32 K = 0; K < 3; ++K) Unique.Add(Triangle[K]);
        RegionVertices = Unique.Array(); RegionVertices.Sort();
        for (int32 V : RegionVertices) ReferencedVertices.Add(V);
    };
    for (int32 Side = 0; Side < 2; ++Side)
    {
        CollectRegionVertices(Cache.UncappedArmTriangles[Side], Cache.UncappedArmVertices[Side]);
        CollectRegionVertices(Cache.DistalArmTriangles[Side], Cache.DistalArmVertices[Side]);
    }
    if (!bSawHeadWeightedFace || Cache.HeadInfluenceTriangles.IsEmpty())
        return Fail(TEXT("No head-weighted clearance faces"));
    Cache.bHeadInfluenceCoverComplete = true;
    CollectRegionVertices(Cache.HeadInfluenceTriangles, Cache.HeadInfluenceVertices);
    if(Cache.bCanCertifyArmPair)for(int32 Side=0;Side<2;++Side)
        for(const auto& Triangle:Cache.FullArmTriangles[Side])AddTriangle(Triangle);
    CollectReferences(Cache.ReferencedVertices, Cache.ReferencedBones);
    Out = MoveTemp(Cache);
    return true;
}

uint8 FFlowArtsSkinnedClearance::CertifyForearmHeadSkinClear(const FFlowArtsSkinnedClearanceData& Data,
    TConstArrayView<FTransform> Transforms, float PaddingCm, uint8 RequestedMask,
    FFlowArtsHeadSkinCertificateDiagnostics* OutDiagnostics)
{
    if (OutDiagnostics) *OutDiagnostics = FFlowArtsHeadSkinCertificateDiagnostics();
    if (!(RequestedMask & 3) || !FMath::IsFinite(PaddingCm) || PaddingCm < 0.f ||
        Data.ReferenceBoneCount <= 0 || Transforms.Num() < Data.ReferenceBoneCount ||
        !Data.bHeadInfluenceCoverComplete ||
        !Transforms.IsValidIndex(Data.HeadInfluenceBone) ||
        !Transforms.IsValidIndex(Data.HeadInfluenceHeadBone) ||
        !Transforms[Data.HeadInfluenceBone].IsValid() ||
        !Transforms[Data.HeadInfluenceHeadBone].IsValid()) return 0;
    const auto Finite = [](const FVector& V)
    { return FMath::IsFinite(V.X) && FMath::IsFinite(V.Y) && FMath::IsFinite(V.Z); };
    using FRegion = FFlowArtsSkinnedClearanceData::FClosedInfluenceRegion;
    const auto RegionValid = [&](const FRegion& Region, int32 SourceOriginalCount) -> bool
    {
        const int32 FaceCount = Region.Triangles.Num();
        if (!Region.bClosureValidated || Region.OriginalTriangleCount <= 0 || Region.OriginalTriangleCount > FaceCount ||
            Region.OriginalTriangleCount != SourceOriginalCount ||
            Region.Components.Num() != FaceCount || Region.Witnesses.IsEmpty() ||
            Region.Topology.Order.Num() != FaceCount || Region.Topology.Nodes.IsEmpty()) return false;
        const int32 ComponentCount = Region.Witnesses.Num();
        if (ComponentCount > 128) return false;
        TArray<uint8> Seen; Seen.Init(0, FaceCount);
        for (int32 Face : Region.Topology.Order)
        {
            if (!Seen.IsValidIndex(Face) || Seen[Face]) return false;
            Seen[Face] = 1;
        }
        for (int32 Component : Region.Components)
            if (Component < 0 || Component >= ComponentCount) return false;
        for (int32 Component = 0; Component < ComponentCount; ++Component)
        {
            const int32 Witness = Region.Witnesses[Component];
            if (!Region.Triangles.IsValidIndex(Witness) || Region.Components[Witness] != Component) return false;
        }
        // Reject stale or hand-assembled nonmanifold caches as well as a failed
        // Build closure. Every directed edge needs exactly one opposite mate.
        struct FEdgeUse { int32 A, B, Count; };
        TMap<uint64, FEdgeUse> Edges;
        for (const FIntVector& Face : Region.Triangles)
        {
            if (!Data.Vertices.IsValidIndex(Face.X) || !Data.Vertices.IsValidIndex(Face.Y) ||
                !Data.Vertices.IsValidIndex(Face.Z) || Face.X == Face.Y || Face.Y == Face.Z ||
                Face.Z == Face.X) return false;
            for (int32 K = 0; K < 3; ++K)
            {
                const int32 A = Face[K], B = Face[(K + 1) % 3];
                const uint64 Key = (uint64(FMath::Min(A, B)) << 32) | uint32(FMath::Max(A, B));
                FEdgeUse* Edge = Edges.Find(Key);
                if (!Edge) Edges.Add(Key, {A, B, 1});
                else
                {
                    if (Edge->Count != 1 || Edge->A != B || Edge->B != A) return false;
                    Edge->Count = 2;
                }
            }
        }
        for (const auto& Edge : Edges) if (Edge.Value.Count != 2) return false;
        for (int32 Index = 0; Index < Region.Topology.Nodes.Num(); ++Index)
        {
            const auto& Node = Region.Topology.Nodes[Index];
            if (Node.Begin < 0 || Node.End <= Node.Begin || Node.End > FaceCount) return false;
            if (Node.Left == INDEX_NONE)
            {
                if (Node.Right != INDEX_NONE) return false;
            }
            else if (Node.Left <= Index || Node.Right <= Index ||
                !Region.Topology.Nodes.IsValidIndex(Node.Left) ||
                !Region.Topology.Nodes.IsValidIndex(Node.Right)) return false;
            else
            {
                const auto& Left = Region.Topology.Nodes[Node.Left];
                const auto& Right = Region.Topology.Nodes[Node.Right];
                if (Left.Begin != Node.Begin || Left.End != Right.Begin || Right.End != Node.End)
                    return false;
            }
        }
        if (Region.Topology.Nodes[0].Begin != 0 || Region.Topology.Nodes[0].End != FaceCount)
            return false;
        return true;
    };
    const FRegion& Head = Data.ClosedInfluenceHead;
    if (OutDiagnostics)
    {
        OutDiagnostics->HeadOriginalTriangles = Head.OriginalTriangleCount;
        OutDiagnostics->HeadCapTriangles = Head.Triangles.Num() - Head.OriginalTriangleCount;
        for (int32 Side = 0; Side < 2; ++Side)
        {
            const FRegion& Arm = Data.ClosedInfluenceArm[Side];
            OutDiagnostics->ArmOriginalTriangles[Side] = Arm.OriginalTriangleCount;
            OutDiagnostics->ArmCapTriangles[Side] = Arm.Triangles.Num() - Arm.OriginalTriangleCount;
        }
    }
    if (!RegionValid(Head, Data.HeadInfluenceTriangles.Num())) return 0;
    TArray<FVector> Posed; Posed.SetNumUninitialized(Data.Vertices.Num());
    TArray<uint8> Ready; Ready.Init(0, Data.Vertices.Num());
    const auto Skin = [&](int32 VertexIndex) -> bool
    {
        if (!Data.Vertices.IsValidIndex(VertexIndex)) return false;
        if (Ready[VertexIndex]) return true;
        const auto& Vertex = Data.Vertices[VertexIndex];
        if (Vertex.InfluenceCount <= 0 || Vertex.FirstInfluence < 0 ||
            Vertex.FirstInfluence + Vertex.InfluenceCount > Data.Influences.Num()) return false;
        FVector Point = FVector::ZeroVector;
        double Weight = 0.;
        for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
        {
            const auto& Influence = Data.Influences[I];
            if (!Transforms.IsValidIndex(Influence.Bone) || !Transforms[Influence.Bone].IsValid() ||
                !FMath::IsFinite(Influence.Weight) || Influence.Weight < 0.f ||
                !Finite(Influence.BoneLocalPosition)) return false;
            Point += Transforms[Influence.Bone].TransformPosition(Influence.BoneLocalPosition) * Influence.Weight;
            Weight += Influence.Weight;
        }
        if (!FMath::IsNearlyEqual(Weight, 1., 1.e-3) || !Finite(Point)) return false;
        Posed[VertexIndex] = Point; Ready[VertexIndex] = 1;
        return true;
    };
    const auto SkinRegion = [&](const FRegion& Region) -> bool
    {
        for (const FIntVector& Face : Region.Triangles)
        {
            for (int32 K = 0; K < 3; ++K)
                if (!Skin(Face[K])) return false;
            const FVector Normal = FVector::CrossProduct(Posed[Face.Y] - Posed[Face.X],
                Posed[Face.Z] - Posed[Face.X]);
            if (!Finite(Normal) || Normal.SizeSquared() <= 1.e-12) return false;
        }
        return true;
    };
    if (!SkinRegion(Head))
    {
        if (OutDiagnostics) for (uint8& Reason : OutDiagnostics->Reason) Reason = 2;
        return 0;
    }
    TSet<int32> HeadOriginalVertices;
    for (int32 I = 0; I < Head.OriginalTriangleCount; ++I)
        for (int32 K = 0; K < 3; ++K) HeadOriginalVertices.Add(Head.Triangles[I][K]);
    FSurfaceTree HeadTree(Posed, Head.Triangles, Head.Topology);
    HeadTree.Components = &Head.Components;
    HeadTree.ComponentCount = Head.Witnesses.Num();
    HeadTree.bRequireEscapeRay = true;
    uint8 Clear = 0;
    const double Margin = double(PaddingCm) + 1.e-4;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (!(RequestedMask & (1 << Side))) continue;
        const FRegion& Arm = Data.ClosedInfluenceArm[Side];
        if (!RegionValid(Arm, Data.UncappedArmTriangles[Side].Num())) continue;
        bool bShared = false;
        for (int32 I = 0; I < Arm.OriginalTriangleCount && !bShared; ++I)
            for (int32 K = 0; K < 3; ++K)
                bShared |= HeadOriginalVertices.Contains(Arm.Triangles[I][K]);
        if (bShared)
        {
            if (OutDiagnostics) OutDiagnostics->Reason[Side] = 3;
            continue;
        }
        if (!SkinRegion(Arm))
        {
            if (OutDiagnostics) OutDiagnostics->Reason[Side] = 2;
            continue;
        }
        FSurfaceTree ArmTree(Posed, Arm.Triangles, Arm.Topology);
        ArmTree.Components = &Arm.Components;
        ArmTree.ComponentCount = Arm.Witnesses.Num();
        ArmTree.bRequireEscapeRay = true;
        uint8 Reason = 1;
        int32 ArmContact = INDEX_NONE, HeadContact = INDEX_NONE;
        if (ArmPairClear(ArmTree, HeadTree, Arm.Witnesses, Head.Witnesses,
            Margin, &Reason, &ArmContact, &HeadContact)) Clear |= uint8(1 << Side);
        if (OutDiagnostics)
        {
            OutDiagnostics->Reason[Side] = Reason == 2 ? 4 : Reason == 3 ? 5 : Reason == 4 ? 6 : Reason;
            OutDiagnostics->ArmContactTriangle[Side] = ArmContact;
            OutDiagnostics->HeadContactTriangle[Side] = HeadContact;
            OutDiagnostics->bArmContactIsCap[Side] = ArmContact >= Arm.OriginalTriangleCount && ArmContact != INDEX_NONE;
            OutDiagnostics->bHeadContactIsCap[Side] = HeadContact >= Head.OriginalTriangleCount && HeadContact != INDEX_NONE;
        }
    }
    return Clear;
}

uint8 FFlowArtsSkinnedClearance::CertifyForearmHeadClear(const FFlowArtsSkinnedClearanceData& Data,
    TConstArrayView<FTransform> Transforms, float PaddingCm,
    const FFlowArtsClearanceCapsule& LeftForearm,
    const FFlowArtsClearanceCapsule& RightForearm, uint8 RequestedMask)
{
    if (!(RequestedMask & 3) || !FMath::IsFinite(PaddingCm) || PaddingCm < 0.f ||
        Data.ReferenceBoneCount <= 0 || Transforms.Num() < Data.ReferenceBoneCount ||
        !Data.bHeadInfluenceCoverComplete ||
        !Transforms.IsValidIndex(Data.HeadInfluenceBone) ||
        !Transforms.IsValidIndex(Data.HeadInfluenceHeadBone) ||
        !Transforms[Data.HeadInfluenceBone].IsValid() ||
        !Transforms[Data.HeadInfluenceHeadBone].IsValid() ||
        Data.HeadInfluenceTriangles.IsEmpty()) return 0;

    const auto Finite = [](const FVector& V)
    { return FMath::IsFinite(V.X) && FMath::IsFinite(V.Y) && FMath::IsFinite(V.Z); };
    // Use the faces themselves rather than a separately cached vertex list:
    // an incomplete list must never certify a face that it did not project.
    TSet<int32> HeadVertices;
    for (const FIntVector& Triangle : Data.HeadInfluenceTriangles)
        for (int32 Corner = 0; Corner < 3; ++Corner)
        {
            if (!Data.Vertices.IsValidIndex(Triangle[Corner])) return 0;
            HeadVertices.Add(Triangle[Corner]);
        }
    if (HeadVertices.IsEmpty()) return 0;
    TArray<FVector> HeadPoints;
    HeadPoints.Reserve(HeadVertices.Num());
    FVector HeadCenter = FVector::ZeroVector;
    for (int32 Index : HeadVertices)
    {
        const auto& Vertex = Data.Vertices[Index];
        if (Vertex.InfluenceCount <= 0 || Vertex.FirstInfluence < 0 ||
            Vertex.FirstInfluence + Vertex.InfluenceCount > Data.Influences.Num()) return 0;
        FVector Point = FVector::ZeroVector;
        double TotalWeight = 0.;
        for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
        {
            const auto& Influence = Data.Influences[I];
            if (!Transforms.IsValidIndex(Influence.Bone) || !Transforms[Influence.Bone].IsValid() ||
                !FMath::IsFinite(Influence.Weight) || Influence.Weight < 0.f ||
                !Finite(Influence.BoneLocalPosition)) return 0;
            Point += Transforms[Influence.Bone].TransformPosition(Influence.BoneLocalPosition) * Influence.Weight;
            TotalWeight += Influence.Weight;
        }
        if (!FMath::IsNearlyEqual(TotalWeight, 1., 1.e-3) || !Finite(Point)) return 0;
        HeadPoints.Add(Point);
        HeadCenter += Point;
    }
    HeadCenter /= double(HeadPoints.Num());
    if (!Finite(HeadCenter)) return 0;

    const FQuat HeadRotation = Transforms[Data.HeadInfluenceBone].GetRotation();
    if (!HeadRotation.IsNormalized()) return 0;
    const double Margin = double(PaddingCm) + 1.e-4; // Roundoff rejects, never grants.
    const FFlowArtsClearanceCapsule* Forearms[2] = {&LeftForearm, &RightForearm};
    uint8 Clear = 0;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (!(RequestedMask & (1 << Side))) continue;
        const auto& Capsule = *Forearms[Side];
        if (!Finite(Capsule.Start) || !Finite(Capsule.End) ||
            !FMath::IsFinite(Capsule.RadiusCm) || Capsule.RadiusCm < 0.f) continue;
        // Every axis gives a containing projection of the full posed surface
        // and the unchanged capsule. Overlap on all axes is inconclusive.
        TArray<FVector, TInlineAllocator<9>> Axes;
        for (const FVector Base : {FVector::ForwardVector, FVector::RightVector, FVector::UpVector})
        {
            Axes.Add(Base);
            Axes.Add(HeadRotation.RotateVector(Base));
        }
        Axes.Add(Capsule.End - Capsule.Start);
        Axes.Add(HeadCenter - (Capsule.Start + Capsule.End) * .5);
        for (const FVector& Candidate : Axes)
        {
            if (!Finite(Candidate)) break;
            const FVector Axis = Candidate.GetSafeNormal();
            if (Axis.IsNearlyZero()) continue;
            double HeadLo = TNumericLimits<double>::Max(), HeadHi = -TNumericLimits<double>::Max();
            bool bValid = true;
            for (const FVector& Point : HeadPoints)
            {
                const double Projection = FVector::DotProduct(Point, Axis);
                if (!FMath::IsFinite(Projection)) { bValid = false; break; }
                HeadLo = FMath::Min(HeadLo, Projection);
                HeadHi = FMath::Max(HeadHi, Projection);
            }
            if (!bValid) break;
            const double Start = FVector::DotProduct(Capsule.Start, Axis);
            const double End = FVector::DotProduct(Capsule.End, Axis);
            if (!FMath::IsFinite(Start) || !FMath::IsFinite(End)) break;
            const double CapsuleLo = FMath::Min(Start, End) - Capsule.RadiusCm;
            const double CapsuleHi = FMath::Max(Start, End) + Capsule.RadiusCm;
            if (HeadHi + Margin < CapsuleLo || CapsuleHi + Margin < HeadLo)
            { Clear |= uint8(1 << Side); break; }
        }
    }
    return Clear;
}

void FFlowArtsSkinnedClearance::MeasureForearmHeadSurface(const FFlowArtsSkinnedClearanceData& Data,
    TConstArrayView<FTransform> Transforms, float PaddingCm,
    const FFlowArtsClearanceCapsule& LeftForearm,
    const FFlowArtsClearanceCapsule& RightForearm,
    FFlowArtsHeadSurfaceDistance Out[2], uint8 RequestedMask)
{
    if (!Out) return;
    Out[0] = FFlowArtsHeadSurfaceDistance();
    Out[1] = FFlowArtsHeadSurfaceDistance();
    if (!(RequestedMask & 3) || !FMath::IsFinite(PaddingCm) || PaddingCm < 0.f ||
        Data.ReferenceBoneCount <= 0 || Transforms.Num() < Data.ReferenceBoneCount ||
        !Data.bHeadInfluenceCoverComplete ||
        !Transforms.IsValidIndex(Data.HeadInfluenceBone) ||
        !Transforms.IsValidIndex(Data.HeadInfluenceHeadBone) ||
        !Transforms[Data.HeadInfluenceBone].IsValid() ||
        !Transforms[Data.HeadInfluenceHeadBone].IsValid() ||
        Data.HeadInfluenceTriangles.IsEmpty()) return;

    const auto Finite = [](const FVector& V)
    { return FMath::IsFinite(V.X) && FMath::IsFinite(V.Y) && FMath::IsFinite(V.Z); };
    TArray<FVector> Posed;
    Posed.SetNumUninitialized(Data.Vertices.Num());
    TArray<uint8> Ready;
    Ready.Init(0, Data.Vertices.Num());
    const auto Skin = [&](int32 Index) -> bool
    {
        if (!Data.Vertices.IsValidIndex(Index)) return false;
        if (Ready[Index]) return true;
        const auto& Vertex = Data.Vertices[Index];
        if (Vertex.InfluenceCount <= 0 || Vertex.FirstInfluence < 0 ||
            Vertex.FirstInfluence + Vertex.InfluenceCount > Data.Influences.Num()) return false;
        FVector Point = FVector::ZeroVector;
        double TotalWeight = 0.;
        for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
        {
            const auto& Influence = Data.Influences[I];
            if (!Transforms.IsValidIndex(Influence.Bone) || !Transforms[Influence.Bone].IsValid() ||
                !Finite(Influence.BoneLocalPosition) || !FMath::IsFinite(Influence.Weight) ||
                Influence.Weight < 0.f) return false;
            Point += Transforms[Influence.Bone].TransformPosition(Influence.BoneLocalPosition) * Influence.Weight;
            TotalWeight += Influence.Weight;
        }
        if (!FMath::IsNearlyEqual(TotalWeight, 1., 1.e-3) || !Finite(Point)) return false;
        Posed[Index] = Point;
        Ready[Index] = 1;
        return true;
    };
    // Validate and skin the complete original cover before reporting either side.
    for (const FIntVector& Triangle : Data.HeadInfluenceTriangles)
        for (int32 Corner = 0; Corner < 3; ++Corner)
            if (!Skin(Triangle[Corner])) return;

    const FFlowArtsClearanceCapsule* Forearms[2] = {&LeftForearm, &RightForearm};
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (!(RequestedMask & (1 << Side))) continue;
        const auto& Capsule = *Forearms[Side];
        if (!Finite(Capsule.Start) || !Finite(Capsule.End) ||
            !FMath::IsFinite(Capsule.RadiusCm) || Capsule.RadiusCm < 0.f) continue;
        double BestSq = TNumericLimits<double>::Max();
        int32 BestIndex = INDEX_NONE;
        for (int32 Index = 0; Index < Data.HeadInfluenceTriangles.Num(); ++Index)
        {
            const FIntVector& Face = Data.HeadInfluenceTriangles[Index];
            const FVector Points[3] = {Posed[Face.X], Posed[Face.Y], Posed[Face.Z]};
            const double DistanceSq = SegmentTriangleDistanceSq(Capsule.Start, Capsule.End, Points);
            if (!FMath::IsFinite(DistanceSq) || DistanceSq < 0.) { BestIndex = INDEX_NONE; break; }
            if (DistanceSq < BestSq) { BestSq = DistanceSq; BestIndex = Index; }
        }
        if (BestIndex == INDEX_NONE) continue;
        FFlowArtsHeadSurfaceDistance& Result = Out[Side];
        Result.AxisDistanceCm = FMath::Sqrt(BestSq);
        Result.RadiusPlusPaddingCm = double(Capsule.RadiusCm) + double(PaddingCm);
        Result.SignedMarginCm = Result.AxisDistanceCm - Result.RadiusPlusPaddingCm;
        if (!FMath::IsFinite(Result.SignedMarginCm)) { Result = FFlowArtsHeadSurfaceDistance(); continue; }
        Result.TriangleIndex = BestIndex;
        Result.VertexIndices = Data.HeadInfluenceTriangles[BestIndex];
        for (int32 Corner = 0; Corner < 3; ++Corner)
        {
            const int32 Index = Result.VertexIndices[Corner];
            Result.PosedVertices[Corner] = Posed[Index];
            const auto& Vertex = Data.Vertices[Index];
            for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
            {
                const auto& Influence = Data.Influences[I];
                if (!Result.CornerInfluences[Corner].IsEmpty()) Result.CornerInfluences[Corner] += TEXT(",");
                Result.CornerInfluences[Corner] += FString::Printf(TEXT("%d:%.9g"),
                    Influence.Bone, double(Influence.Weight));
            }
        }
        Result.bValid = true;
    }
}

void FFlowArtsSkinnedClearance::MeasureDistalHeadSkin(const FFlowArtsSkinnedClearanceData& Data,
    TConstArrayView<FTransform> Transforms, float PaddingCm,
    FFlowArtsHeadSkinDistance Out[2], uint8 RequestedMask)
{
    if (!Out) return;
    Out[0] = FFlowArtsHeadSkinDistance();
    Out[1] = FFlowArtsHeadSkinDistance();
    if (!(RequestedMask & 3) || !FMath::IsFinite(PaddingCm) || PaddingCm < 0.f ||
        Data.ReferenceBoneCount <= 0 || Transforms.Num() < Data.ReferenceBoneCount ||
        !Data.bHeadInfluenceCoverComplete || Data.HeadInfluenceTriangles.IsEmpty() ||
        !Transforms.IsValidIndex(Data.HeadInfluenceBone) ||
        !Transforms.IsValidIndex(Data.HeadInfluenceHeadBone) ||
        !Transforms[Data.HeadInfluenceBone].IsValid() ||
        !Transforms[Data.HeadInfluenceHeadBone].IsValid()) return;
    const auto Finite = [](const FVector& V)
    { return FMath::IsFinite(V.X) && FMath::IsFinite(V.Y) && FMath::IsFinite(V.Z); };
    TArray<FVector> Posed;
    Posed.SetNumUninitialized(Data.Vertices.Num());
    TArray<uint8> Ready;
    Ready.Init(0, Data.Vertices.Num());
    const auto Skin = [&](int32 Index) -> bool
    {
        if (!Data.Vertices.IsValidIndex(Index)) return false;
        if (Ready[Index]) return true;
        const auto& Vertex = Data.Vertices[Index];
        if (Vertex.InfluenceCount <= 0 || Vertex.FirstInfluence < 0 ||
            Vertex.FirstInfluence + Vertex.InfluenceCount > Data.Influences.Num()) return false;
        FVector Point = FVector::ZeroVector;
        double Total = 0.;
        for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
        {
            const auto& Influence = Data.Influences[I];
            if (!Transforms.IsValidIndex(Influence.Bone) || !Transforms[Influence.Bone].IsValid() ||
                !Finite(Influence.BoneLocalPosition) || !FMath::IsFinite(Influence.Weight) ||
                Influence.Weight < 0.f) return false;
            Point += Transforms[Influence.Bone].TransformPosition(Influence.BoneLocalPosition) * Influence.Weight;
            Total += Influence.Weight;
        }
        if (!FMath::IsNearlyEqual(Total, 1., 1.e-3) || !Finite(Point)) return false;
        Posed[Index] = Point;
        Ready[Index] = 1;
        return true;
    };
    const auto Collect = [&](const TArray<FIntVector>& Faces, TSet<int32>& Indices) -> bool
    {
        if (Faces.IsEmpty()) return false;
        for (const FIntVector& Face : Faces)
            for (int32 Corner = 0; Corner < 3; ++Corner)
            {
                if (!Skin(Face[Corner])) return false;
                Indices.Add(Face[Corner]);
            }
        return !Indices.IsEmpty();
    };
    TSet<int32> HeadIndices;
    if (!Collect(Data.HeadInfluenceTriangles, HeadIndices)) return;
    const auto Describe = [&](const FIntVector& Face, FVector (&Points)[3], FString (&Weights)[3])
    {
        for (int32 Corner = 0; Corner < 3; ++Corner)
        {
            const int32 Index = Face[Corner];
            Points[Corner] = Posed[Index];
            const auto& Vertex = Data.Vertices[Index];
            for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
            {
                const auto& Influence = Data.Influences[I];
                if (!Weights[Corner].IsEmpty()) Weights[Corner] += TEXT(",");
                Weights[Corner] += FString::Printf(TEXT("%d:%.9g"),
                    Influence.Bone, double(Influence.Weight));
            }
        }
    };
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (!(RequestedMask & (1 << Side))) continue;
        if (!Transforms.IsValidIndex(Data.UncappedArmBone[Side]) ||
            !Transforms.IsValidIndex(Data.DistalArmBone[Side]) ||
            !Transforms[Data.UncappedArmBone[Side]].IsValid() ||
            !Transforms[Data.DistalArmBone[Side]].IsValid()) continue;
        TSet<int32> WholeIndices, DistalIndices;
        if (!Collect(Data.UncappedArmTriangles[Side], WholeIndices) ||
            !Collect(Data.DistalArmTriangles[Side], DistalIndices)) continue;
        FFlowArtsHeadSkinDistance& Result = Out[Side];
        FVector HeadCenter = FVector::ZeroVector, ArmCenter = FVector::ZeroVector;
        for (int32 Index : HeadIndices) HeadCenter += Posed[Index];
        for (int32 Index : WholeIndices) ArmCenter += Posed[Index];
        HeadCenter /= double(HeadIndices.Num());
        ArmCenter /= double(WholeIndices.Num());
        if (!Finite(HeadCenter) || !Finite(ArmCenter)) continue;
        const FQuat HeadRotation = Transforms[Data.HeadInfluenceBone].GetRotation();
        const FQuat ArmRotation = Transforms[Data.DistalArmBone[Side]].GetRotation();
        if (!HeadRotation.IsNormalized() || !ArmRotation.IsNormalized()) continue;
        TArray<FVector, TInlineAllocator<10>> Axes;
        for (const FVector Base : {FVector::ForwardVector, FVector::RightVector, FVector::UpVector})
        {
            Axes.Add(Base);
            Axes.Add(HeadRotation.RotateVector(Base));
            Axes.Add(ArmRotation.RotateVector(Base));
        }
        Axes.Add(ArmCenter - HeadCenter);
        double BestGap = -TNumericLimits<double>::Max();
        bool bProjectionValid = true;
        for (const FVector& Candidate : Axes)
        {
            if (!Finite(Candidate)) { bProjectionValid = false; break; }
            const FVector Axis = Candidate.GetSafeNormal();
            if (Axis.IsNearlyZero()) continue;
            double HeadLo = TNumericLimits<double>::Max(), HeadHi = -HeadLo;
            double ArmLo = TNumericLimits<double>::Max(), ArmHi = -ArmLo;
            for (int32 Index : HeadIndices)
            {
                const double V = FVector::DotProduct(Posed[Index], Axis);
                if (!FMath::IsFinite(V)) { bProjectionValid = false; break; }
                HeadLo = FMath::Min(HeadLo, V); HeadHi = FMath::Max(HeadHi, V);
            }
            if (!bProjectionValid) break;
            for (int32 Index : WholeIndices)
            {
                const double V = FVector::DotProduct(Posed[Index], Axis);
                if (!FMath::IsFinite(V)) { bProjectionValid = false; break; }
                ArmLo = FMath::Min(ArmLo, V); ArmHi = FMath::Max(ArmHi, V);
            }
            if (!bProjectionValid) break;
            BestGap = FMath::Max(BestGap,
                FMath::Max(HeadLo - ArmHi, ArmLo - HeadHi) - double(PaddingCm));
        }
        if (!bProjectionValid || !FMath::IsFinite(BestGap) ||
            BestGap == -TNumericLimits<double>::Max()) continue;
        Result.bValid = true;
        Result.BestProjectionGapCm = BestGap;
        Result.bWholeArmProjectionSeparated = BestGap > 1.e-4;
        if (Result.bWholeArmProjectionSeparated) continue;
        // A head region is open. Absence of nearby original faces is only
        // diagnostic, never a containment certificate.
        FSurfaceTree HeadTree(Posed, Data.HeadInfluenceTriangles);
        if (HeadTree.Nodes.IsEmpty()) { Result = FFlowArtsHeadSkinDistance(); continue; }
        const double Margin = double(PaddingCm) + 1.e-4;
        for (int32 Index = 0; Index < Data.DistalArmTriangles[Side].Num(); ++Index)
        {
            const FIntVector& Face = Data.DistalArmTriangles[Side][Index];
            const FVector Points[3] = {Posed[Face.X], Posed[Face.Y], Posed[Face.Z]};
            FBox Box(ForceInit);
            for (const FVector& Point : Points) Box += Point;
            int32 HeadIndex = INDEX_NONE;
            if (!HeadTree.Near(0, Points, Box.ExpandBy(Margin), Margin * Margin, &HeadIndex)) continue;
            if (!Data.HeadInfluenceTriangles.IsValidIndex(HeadIndex))
            { Result = FFlowArtsHeadSkinDistance(); break; }
            const FIntVector& HeadFace = Data.HeadInfluenceTriangles[HeadIndex];
            const FVector HeadPoints[3] = {Posed[HeadFace.X], Posed[HeadFace.Y], Posed[HeadFace.Z]};
            const double DistanceSq = TriangleDistanceSq(Points, HeadPoints);
            if (!FMath::IsFinite(DistanceSq) || DistanceSq < 0.)
            { Result = FFlowArtsHeadSkinDistance(); break; }
            Result.bDistalSurfaceNear = true;
            Result.WitnessSurfaceDistanceCm = FMath::Sqrt(DistanceSq);
            Result.DistalTriangleIndex = Index;
            Result.HeadTriangleIndex = HeadIndex;
            Result.DistalVertexIndices = Face;
            Result.HeadVertexIndices = HeadFace;
            Describe(Face, Result.DistalPosedVertices, Result.DistalCornerInfluences);
            Describe(HeadFace, Result.HeadPosedVertices, Result.HeadCornerInfluences);
            break;
        }
    }
}

uint8 FFlowArtsSkinnedClearance::CertifyUncappedSegments(const FFlowArtsSkinnedClearanceData& Data,
    TConstArrayView<FTransform> Transforms, float PaddingCm,
    TConstArrayView<FFlowArtsClearanceCapsule> LeftHeldProps,
    TConstArrayView<FFlowArtsClearanceCapsule> RightHeldProps, uint8 RequestedMask)
{
    if (!RequestedMask || !FMath::IsFinite(PaddingCm) || PaddingCm < 0.f ||
        Transforms.Num() < Data.ReferenceBoneCount || Data.Vertices.IsEmpty()) return 0;
    // Each projected interval contains the convex hull of every original face
    // touched by the named bone chain, including any cut closure inside it.
    // A strict separating axis therefore proves solid noncontact. Failing to
    // find one is inconclusive and leaves the broad proxy in force.
    TArray<FVector> Posed; Posed.SetNumUninitialized(Data.Vertices.Num());
    TArray<uint8> Ready; Ready.Init(0, Data.Vertices.Num());
    const auto FiniteVector = [](const FVector& Value)
    { return FMath::IsFinite(Value.X) && FMath::IsFinite(Value.Y) && FMath::IsFinite(Value.Z); };
    const auto Skin = [&](int32 VertexIndex, FVector& OutPoint) -> bool
    {
        if (!Data.Vertices.IsValidIndex(VertexIndex)) return false;
        if (!Ready[VertexIndex])
        {
            const auto& Vertex = Data.Vertices[VertexIndex];
            if (Vertex.InfluenceCount <= 0 ||
                Vertex.FirstInfluence < 0 || Vertex.FirstInfluence + Vertex.InfluenceCount > Data.Influences.Num()) return false;
            FVector Point = FVector::ZeroVector;
            double TotalWeight = 0.;
            for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
            {
                const auto& Influence = Data.Influences[I];
                if (!Transforms.IsValidIndex(Influence.Bone) || !FMath::IsFinite(Influence.Weight) ||
                    Influence.Weight < 0.f || !FiniteVector(Influence.BoneLocalPosition) ||
                    !Transforms[Influence.Bone].IsValid()) return false;
                Point += Transforms[Influence.Bone].TransformPosition(Influence.BoneLocalPosition) * Influence.Weight;
                TotalWeight += Influence.Weight;
            }
            if (!FMath::IsNearlyEqual(TotalWeight, 1., 1.e-3) || !FiniteVector(Point)) return false;
            Posed[VertexIndex] = Point; Ready[VertexIndex] = 1;
        }
        OutPoint = Posed[VertexIndex]; return true;
    };
    const auto Project = [&](const TArray<int32>& Vertices, const FVector& Axis, double& Lo, double& Hi) -> bool
    {
        if (Vertices.IsEmpty()) return false;
        Lo = TNumericLimits<double>::Max(); Hi = -TNumericLimits<double>::Max();
        for (int32 Vertex : Vertices)
        {
            FVector Point;
            if (!Skin(Vertex, Point)) return false;
            const double Value = FVector::DotProduct(Point, Axis);
            if (!FMath::IsFinite(Value)) return false;
            Lo = FMath::Min(Lo, Value); Hi = FMath::Max(Hi, Value);
        }
        return true;
    };
    const auto AxesFor = [&](int32 Bone, TArray<FVector, TInlineAllocator<9>>& Axes) -> bool
    {
        if (!Transforms.IsValidIndex(Bone) || !Transforms[Bone].IsValid()) return false;
        const FQuat Rotation = Transforms[Bone].GetRotation();
        for (const FVector Base : {FVector::ForwardVector, FVector::RightVector, FVector::UpVector})
        {
            const FVector Axis = Rotation.RotateVector(Base).GetSafeNormal();
            if (!FiniteVector(Axis) || Axis.IsNearlyZero()) return false;
            Axes.Add(Axis);
        }
        return true;
    };
    const double Margin = double(PaddingCm) + 1.e-4; // Roundoff rejects, never grants.
    const auto RegionsSeparate = [&](const TArray<int32>& A, int32 BoneA,
        const TArray<int32>& B, int32 BoneB) -> bool
    {
        TArray<FVector, TInlineAllocator<9>> Axes;
        if (!AxesFor(BoneA, Axes) || !AxesFor(BoneB, Axes)) return false;
        for (const FVector& Axis : Axes)
        {
            double ALo, AHi, BLo, BHi;
            if (!Project(A, Axis, ALo, AHi) || !Project(B, Axis, BLo, BHi)) return false;
            if (AHi + Margin < BLo || BHi + Margin < ALo) return true;
        }
        return false;
    };
    const auto RegionPropsSeparate = [&](const TArray<int32>& Region, int32 Bone,
        TConstArrayView<FFlowArtsClearanceCapsule> Props) -> bool
    {
        if (Props.IsEmpty()) return false;
        TArray<FVector, TInlineAllocator<9>> Axes;
        if (!AxesFor(Bone, Axes)) return false;
        for (const auto& Prop : Props)
        {
            if (!FiniteVector(Prop.Start) || !FiniteVector(Prop.End) ||
                !FMath::IsFinite(Prop.RadiusCm) || Prop.RadiusCm < 0.f) return false;
            bool bSeparated = false;
            for (const FVector& Axis : Axes)
            {
                double Lo, Hi;
                if (!Project(Region, Axis, Lo, Hi)) return false;
                const double P0 = FVector::DotProduct(Prop.Start, Axis);
                const double P1 = FVector::DotProduct(Prop.End, Axis);
                const double PropLo = FMath::Min(P0, P1) - Prop.RadiusCm;
                const double PropHi = FMath::Max(P0, P1) + Prop.RadiusCm;
                if (Hi + Margin < PropLo || PropHi + Margin < Lo) { bSeparated = true; break; }
            }
            if (!bSeparated) return false;
        }
        return true;
    };
    const auto SkinRegion = [&](const FFlowArtsSkinnedClearanceData::FClosedInfluenceRegion& Region)
    {
        if (Region.Triangles.IsEmpty() || Region.Witnesses.IsEmpty()) return false;
        for (const FIntVector& Triangle : Region.Triangles)
            for (int32 K = 0; K < 3; ++K)
            {
                FVector Point;
                if (!Skin(Triangle[K], Point)) return false;
            }
        return true;
    };
    uint8 Clear = 0;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const uint8 PairBit = uint8(1 << Side), PropBit = uint8(16 << Side);
        // This proves separation of the distal skin from the entire opposite
        // arm or prop. The proximal shared shoulder seam is deliberately not
        // required to separate. These bits do not waive forearm capsules:
        // upper-only weighted faces can extend into those capsules.
        if ((RequestedMask & PairBit) &&
            RegionsSeparate(Data.DistalArmVertices[Side], Data.DistalArmBone[Side],
                Data.UncappedArmVertices[1 - Side], Data.UncappedArmBone[1 - Side])) Clear |= PairBit;
        if ((RequestedMask & PropBit) &&
            RegionPropsSeparate(Data.DistalArmVertices[Side], Data.DistalArmBone[Side],
                Side == 0 ? RightHeldProps : LeftHeldProps)) Clear |= PropBit;
        const auto& Distal = Data.ClosedInfluenceDistal[Side];
        if ((RequestedMask & ~Clear & (PairBit | PropBit)) && SkinRegion(Distal))
        {
            FSurfaceTree DistalTree(Posed, Distal.Triangles, Distal.Topology);
            DistalTree.Components = &Distal.Components;
            DistalTree.ComponentCount = Distal.Witnesses.Num();
            DistalTree.bRequireEscapeRay = true;
            const auto& Opposite = Data.ClosedInfluenceArm[1 - Side];
            if ((RequestedMask & ~Clear & PairBit) && SkinRegion(Opposite))
            {
                FSurfaceTree OtherTree(Posed, Opposite.Triangles, Opposite.Topology);
                OtherTree.Components = &Opposite.Components;
                OtherTree.ComponentCount = Opposite.Witnesses.Num();
                OtherTree.bRequireEscapeRay = true;
                if (ArmPairClear(DistalTree, OtherTree, Distal.Witnesses, Opposite.Witnesses, Margin))
                    Clear |= PairBit;
            }
            if ((RequestedMask & ~Clear & PropBit) &&
                ArmPropsClear(DistalTree, Side == 0 ? RightHeldProps : LeftHeldProps, Margin))
                Clear |= PropBit;
        }
    }
#if WITH_DEV_AUTOMATION_TESTS
    // Distinguish an inconclusive convex envelope from actual original-face contact.
    // Diagnostic only: never grants a certificate or omits an influenced face.
    if (FParse::Param(FCommandLine::Get(), TEXT("FlowArtsSkinUncappedContacts")))
    {
        const auto Describe = [&](const FIntVector& Triangle)
        {
            FString Text;
            for (int32 K = 0; K < 3; ++K)
            {
                const auto& Vertex = Data.Vertices[Triangle[K]];
                Text += FString::Printf(TEXT(" v%d[%s]="), Triangle[K], *Posed[Triangle[K]].ToString());
                for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
                {
                    const auto& Influence = Data.Influences[I];
                    Text += FString::Printf(TEXT("%s:%.6f,"),
                        *Data.ReferenceBoneNames[Influence.Bone].ToString(), Influence.Weight);
                }
            }
            return Text;
        };
        for (int32 Side = 0; Side < 2; ++Side)
        {
            bool bValid = true;
            for (int32 Vertex : Data.DistalArmVertices[Side]) bValid &= Skin(Vertex, Posed[Vertex]);
            for (int32 Vertex : Data.UncappedArmVertices[1-Side]) bValid &= Skin(Vertex, Posed[Vertex]);
            if (!bValid) continue;
            FSurfaceTree Other(Posed, Data.UncappedArmTriangles[1-Side]);
            int32 Hits = 0;
            if (!Other.Nodes.IsEmpty()) for (const FIntVector& Triangle : Data.DistalArmTriangles[Side])
            {
                const FVector A[3] = {Posed[Triangle.X], Posed[Triangle.Y], Posed[Triangle.Z]};
                FBox Box(ForceInit); for (const FVector& Point : A) Box += Point;
                int32 Contact = INDEX_NONE;
                if (!Other.Near(0, A, Box.ExpandBy(Margin), Margin*Margin, &Contact)) continue;
                if (++Hits <= 2)
                {
                    const FIntVector& T = Data.UncappedArmTriangles[1-Side][Contact];
                    const FVector B[3] = {Posed[T.X], Posed[T.Y], Posed[T.Z]};
                    UE_LOG(LogFlowArtsSkin, Display, TEXT("Uncapped exact pair side=%d distance=%.9g distal=%s opposite=%s"),
                        Side, FMath::Sqrt(TriangleDistanceSq(A,B)), *Describe(Triangle), *Describe(T));
                }
            }
            UE_LOG(LogFlowArtsSkin, Display, TEXT("Uncapped diagnostic side=%d requested=%u clear=%u nearFaces=%d distalFaces=%d oppositeFaces=%d"),
                Side, RequestedMask, Clear, Hits, Data.DistalArmTriangles[Side].Num(), Data.UncappedArmTriangles[1-Side].Num());
            int32 PropHits = 0;
            for (const auto& Prop : (Side == 0 ? RightHeldProps : LeftHeldProps))
                for (const FIntVector& Triangle : Data.DistalArmTriangles[Side])
                {
                    const FVector A[3] = {Posed[Triangle.X], Posed[Triangle.Y], Posed[Triangle.Z]};
                    const double Distance = FMath::Sqrt(SegmentTriangleDistanceSq(Prop.Start, Prop.End, A));
                    if (Distance > Prop.RadiusCm + Margin) continue;
                    if (++PropHits <= 2)
                        UE_LOG(LogFlowArtsSkin, Display, TEXT("Uncapped exact prop side=%d distance=%.9g radius=%.9g face=%s"),
                            Side, Distance, double(Prop.RadiusCm), *Describe(Triangle));
                }
            UE_LOG(LogFlowArtsSkin, Display, TEXT("Uncapped prop diagnostic side=%d nearFaces=%d"), Side, PropHits);
        }
    }
#endif
    return Clear;
}

uint8 FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(const FFlowArtsSkinnedClearanceData& Data,
    TConstArrayView<FTransform> Transforms, float PaddingCm, uint8 SideMask, bool bRequestArmPair,
    TArray<FFlowArtsContactWitness>* OutWitnesses,
    TConstArrayView<FFlowArtsClearanceCapsule> LeftHeldProps,
    TConstArrayView<FFlowArtsClearanceCapsule> RightHeldProps, uint8 RequestedPropSides,
    uint8 RequestedBodyPropSides, TArray<FFlowArtsPropContactWitness>* OutPropWitnesses,
    FFlowArtsArmPairContactWitness* OutArmPairWitness,
    TArray<FFlowArtsArmPairContactWitness>* OutArmPairWitnesses)
{
    TRACE_CPUPROFILER_EVENT_SCOPE(FlowArtsSkinnedCertificate);
    // Prior contacts guide probe ordering only. A local containment escape plane
    // is not a constraint on a different candidate outside another body face.
    TArray<FFlowArtsContactWitness,TInlineAllocator<8>> PriorWitnesses;
    if (OutWitnesses)
    {
        PriorWitnesses.Append(*OutWitnesses);
        OutWitnesses->Reset();
    }
    if (OutPropWitnesses) OutPropWitnesses->Reset();
    if (OutArmPairWitness) *OutArmPairWitness = {};
    if (OutArmPairWitnesses) OutArmPairWitnesses->Reset();
    const bool bQueryPair = bRequestArmPair && Data.bCanCertifyArmPair;
    const bool bOpenPair = bRequestArmPair && !Data.bCanCertifyArmPair &&
        Data.bOpenArmCoverComplete[0] && Data.bOpenArmCoverComplete[1];
    const uint8 PropSides = Data.bCanCertifyArmPair ? RequestedPropSides & 3 : 0;
    const uint8 OpenPropSides = !Data.bCanCertifyArmPair ?
        (RequestedPropSides & uint8((Data.bOpenArmCoverComplete[0] ? 1 : 0) |
            (Data.bOpenArmCoverComplete[1] ? 2 : 0))) : 0;
    const uint8 BodyPropSides = Data.bCanCertifyHeldPropBody ? RequestedBodyPropSides & 3 : 0;
    const uint8 OpenBodyPropSides = !Data.bCanCertifyHeldPropBody &&
        Data.bOpenBodyPropCoverComplete ? RequestedBodyPropSides & 3 : 0;
    const bool bOpenUpper = (SideMask & 3) && !Data.bTorsoCoveredByClosedBody &&
        Data.bOpenBodyCoverComplete;
#if WITH_DEV_AUTOMATION_TESTS
    // Diagnostic only: compare the bounded witness probes with every failing
    // exposed upper triangle. It does not alter the certificate or witness set.
    const bool bExhaustiveContactDiagnostic = FParse::Param(FCommandLine::Get(),
        TEXT("FlowArtsSkinExhaustiveContacts"));
#endif
    const bool bFullArms = bQueryPair || bOpenPair || PropSides != 0 || OpenPropSides != 0;
    const bool bFullVertices = bFullArms || bOpenUpper || OpenBodyPropSides != 0 ||
        ((SideMask&3) && !Data.LowerBodyRegions.IsEmpty());
    const auto& VertexIndices = bFullVertices ? Data.ReferencedVertices : Data.UpperReferencedVertices;
    const auto& BoneIndices = bFullVertices ? Data.ReferencedBones : Data.UpperReferencedBones;
    if (Transforms.Num() != Data.ReferenceBoneCount || VertexIndices.IsEmpty() ||
        !FMath::IsFinite(PaddingCm) || PaddingCm < 0.f) return 0;
    for (int32 Bone : BoneIndices)
        if (!Transforms.IsValidIndex(Bone) || Transforms[Bone].ContainsNaN()) return 0;
    TArray<FVector> Points; Points.SetNumUninitialized(Data.Vertices.Num());
    {
    TRACE_CPUPROFILER_EVENT_SCOPE(FlowArtsSkinnedSkinVertices);
    for (int32 V : VertexIndices)
    {
        if (!Data.Vertices.IsValidIndex(V)) return 0;
        FVector Point = FVector::ZeroVector;
        const auto& Vertex = Data.Vertices[V];
        if (!Vertex.InfluenceCount || Vertex.FirstInfluence < 0 ||
            Vertex.FirstInfluence + Vertex.InfluenceCount > Data.Influences.Num()) return 0;
        for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
        {
            const auto& Influence = Data.Influences[I];
            Point += Transforms[Influence.Bone].TransformPosition(Influence.BoneLocalPosition) * Influence.Weight;
        }
        if (Point.ContainsNaN()) return 0;
        Points[V] = Point;
    }
    }
    uint8 SupportClear = 0;
    bool bHasLegacySupport = true;
    for (int32 Band = 0; Band < BandCount; ++Band)
        bHasLegacySupport &= Data.TorsoSupportVertices[Band].Num() >= 4;
    if ((SideMask & 3) && !Data.bTorsoCoveredByClosedBody && bHasLegacySupport)
    {
    TRACE_CPUPROFILER_EVENT_SCOPE(FlowArtsSkinnedLegacySupport);
    TArray<FVector, TInlineAllocator<26>> Normals;
    for (int32 X = -1; X <= 1; ++X) for (int32 Y = -1; Y <= 1; ++Y) for (int32 Z = -1; Z <= 1; ++Z)
        if (X || Y || Z) Normals.Add(FVector(X, Y, Z).GetSafeNormal());
    double Offsets[BandCount][26];
    for (int32 Band = 0; Band < BandCount; ++Band)
    {
        if (Data.TorsoSupportVertices[Band].Num() < 4) return 0;
        for (int32 N = 0; N < Normals.Num(); ++N)
        {
            double Support = -TNumericLimits<double>::Max();
            for (int32 V : Data.TorsoSupportVertices[Band])
            {
                if (!Points.IsValidIndex(V)) return 0;
                Support = FMath::Max(Support, FVector::DotProduct(Normals[N], Points[V]));
            }
            Offsets[Band][N] = Support + PaddingCm;
        }
    }
    uint8 Clear = SideMask & 3;
    for (int32 Side = 0; Side < 2; ++Side)
    {
        if (!(Clear & (1 << Side))) continue;
        if (Data.UpperTriangles[Side].IsEmpty()) { Clear &= ~(1 << Side); continue; }
        for (const auto& Triangle : Data.UpperTriangles[Side])
        {
            for (int32 I = 0; I < 3; ++I) if (!Points.IsValidIndex(Triangle.Vertices[I])) return 0;
            const FPolygon Exposed = ExposedTriangle(Triangle, Points);
            for (int32 Band = 0; Band < BandCount; ++Band)
            {
                FPolygon Polygon = Exposed;
                for (int32 N = 0; N < Normals.Num() && !Polygon.IsEmpty(); ++N) Clip(Polygon, Normals[N], Offsets[Band][N]);
                if (!Polygon.IsEmpty()) { Clear &= ~(1 << Side); break; }
            }
            if (!(Clear & (1 << Side))) break;
        }
    }
    // Torso bands omit shoulder surfaces. Every side also needs the complete closed
    // body distance/containment check, even when separated from those torso bands.
    SupportClear = Clear;
    }
    uint8 Clear = 0;
    if(((SideMask&3) || BodyPropSides) && !Data.ClosedBodyTopology.Nodes.IsEmpty() &&
        (Data.bTorsoCoveredByClosedBody || !Data.TorsoTopology.Nodes.IsEmpty()))
    {
        // Bind-valid triangulation stays immutable; exact normalized skinning deforms
        // its boundary positions together with the original body surface.
        TRACE_CPUPROFILER_EVENT_SCOPE(FlowArtsSkinnedBodyPass);
        FSurfaceTree Containment(Points,Data.ClosedBodyTriangles,Data.ClosedBodyTopology);
        Containment.Components=&Data.ClosedBodyComponents;Containment.ComponentCount=Data.BodyComponentCount;
        const auto CertifySides = [&](const FSurfaceTree* Surface)
        {
        TRACE_CPUPROFILER_EVENT_SCOPE(FlowArtsSkinnedUpperExact);
        for(int32 Side=0;Side<2;++Side)
        {
            if(!(SideMask&(1<<Side)))continue;
            if(Data.UpperTriangles[Side].IsEmpty())continue;
            bool bClear=true;
            int32 FirstFailure = INDEX_NONE;
            int32 SideContacts = 0;
            TArray<int32,TInlineAllocator<48>> Probes;
            int32 NextProbe=0;
            const auto BuildProbes = [&](int32 First) {
                const auto& Triangles=Data.UpperTriangles[Side];
                TArray<FVector> Centers;TArray<double> Distances;TBitArray<> Selected(false,Triangles.Num());
                Centers.Reserve(Triangles.Num());Distances.Reserve(Triangles.Num());
                for(const auto& T:Triangles)Centers.Add((Points[T.Vertices.X]+Points[T.Vertices.Y]+Points[T.Vertices.Z])/3.);
                Selected[First]=true;
                for(const FVector& Center:Centers)Distances.Add((Center-Centers[First]).SizeSquared());
                const auto Select=[&](int32 Index) {
                    Probes.Add(Index);Selected[Index]=true;
                    for(int32 I=0;I<Centers.Num();++I)Distances[I]=FMath::Min(Distances[I],(Centers[I]-Centers[Index]).SizeSquared());
                };
                // Keep one remote prior contact, leaving room for new regions rather
                // than spending the entire four-contact budget on a stale local cluster.
                int32 Prior=INDEX_NONE;double PriorDistance=-1.;
                for(const auto& W:PriorWitnesses)
                    if(W.Side==Side && Triangles.IsValidIndex(W.UpperTriangleIndex) && !Selected[W.UpperTriangleIndex] &&
                        Distances[W.UpperTriangleIndex]>PriorDistance)
                    {Prior=W.UpperTriangleIndex;PriorDistance=Distances[Prior];}
                if(Prior!=INDEX_NONE)Select(Prior);
                // Farthest-point probes spread exact checks across the actual posed
                // surface, independent of imported triangle adjacency/order.
                while(Probes.Num()<48 && Probes.Num()+1<Triangles.Num())
                {
                    int32 Best=INDEX_NONE;double Distance=-1.;
                    for(int32 I=0;I<Triangles.Num();++I)
                        if(!Selected[I] && Triangles[I].BindArmFractions.GetMax()>=.23 && Distances[I]>Distance)
                        {Best=I;Distance=Distances[I];}
                    if(Best==INDEX_NONE)break;
                    Select(Best);
                }
            };
            for(int32 Sequential=0;;)
            {
                int32 TriangleIndex;
                if(FirstFailure!=INDEX_NONE)
                {
                    if(NextProbe>=Probes.Num() || SideContacts>=4)break;
                    TriangleIndex=Probes[NextProbe++];
                }
                else
                {
                    if(Sequential>=Data.UpperTriangles[Side].Num())break;
                    TriangleIndex=Sequential++;
                }
                const auto& Triangle=Data.UpperTriangles[Side][TriangleIndex];
                const FPolygon Polygon=ExposedTriangle(Triangle,Points);
                int32 FailureReason=0;
                int32 ContactTriangle=INDEX_NONE;
                bool bContactClosedBody=false;
                double EscapeNormalSign=1.;
                if(Polygon.Num()>=3 && !((Data.bTorsoCoveredByClosedBody || (SupportClear&(1<<Side))) ?
                    Containment.Clear(Polygon,PaddingCm,Containment,&FailureReason,&ContactTriangle,&bContactClosedBody,OutWitnesses?&EscapeNormalSign:nullptr) :
                    Surface->Clear(Polygon,PaddingCm,Containment,&FailureReason,&ContactTriangle,&bContactClosedBody,OutWitnesses?&EscapeNormalSign:nullptr)))
                {
                    if (FirstFailure == INDEX_NONE)
                    {
                        FirstFailure=TriangleIndex;
                        if(OutWitnesses)BuildProbes(TriangleIndex);
                    }
                    if (OutWitnesses && ContactTriangle != INDEX_NONE)
                    {
                        const int32 Existing = OutWitnesses->IndexOfByPredicate([&](const FFlowArtsContactWitness& W) {
                            return W.Side == Side && W.UpperTriangleIndex == TriangleIndex &&
                                W.BodyTriangleIndex == ContactTriangle && W.bClosedBody == bContactClosedBody &&
                                W.bContainment == (FailureReason==3);
                        });
                        // Keep recently observed contacts active. New contacts displace the
                        // oldest witness, so a once-failing shallow pair cannot fill the set forever.
                        if (Existing != INDEX_NONE) OutWitnesses->RemoveAt(Existing);
                        else if (OutWitnesses->Num() >= 32) OutWitnesses->RemoveAt(0);
                        const bool bOrientedSurface=bContactClosedBody && FailureReason!=3 &&
                            Containment.OrientCrossing(Polygon,ContactTriangle,EscapeNormalSign);
                        OutWitnesses->Add({static_cast<uint8>(Side),TriangleIndex,ContactTriangle,bContactClosedBody,
                            FailureReason==3,EscapeNormalSign,bOrientedSurface});
                        ++SideContacts;
                    }
                    if (bClear) UE_LOG(LogFlowArtsSkin,VeryVerbose,
                        TEXT("Upper reject side=%d triangle=%d vertices=%d/%d/%d support=%d reason=%d body=%d caps=%d exposed=%d contact=%d closed=%d"),
                        Side,TriangleIndex,Triangle.Vertices.X,Triangle.Vertices.Y,Triangle.Vertices.Z,
                        Data.bTorsoCoveredByClosedBody || !!(SupportClear&(1<<Side)),FailureReason,Data.BodyTriangles.Num(),
                        Data.BodyCapTriangles.Num(),Polygon.Num(),ContactTriangle,bContactClosedBody);
                    if (bClear && UE_LOG_ACTIVE(LogFlowArtsSkin,VeryVerbose))
                    {
                        const auto& BodyFaces=bContactClosedBody ? Data.ClosedBodyTriangles : Data.TorsoTriangles;
                        if (BodyFaces.IsValidIndex(ContactTriangle) && Polygon.Num()>=3)
                        {
                            const FIntVector& Face=BodyFaces[ContactTriangle];
                            const FVector BodyPoints[3]={Points[Face.X],Points[Face.Y],Points[Face.Z]};
                            double DistanceSq=TNumericLimits<double>::Max();
                            for(int32 I=1;I+1<Polygon.Num();++I)
                            {
                                const FVector ArmPoints[3]={Polygon[0],Polygon[I],Polygon[I+1]};
                                DistanceSq=FMath::Min(DistanceSq,TriangleDistanceSq(ArmPoints,BodyPoints));
                            }
                            UE_LOG(LogFlowArtsSkin,VeryVerbose,
                                TEXT("Upper contact side=%d surfaceDistance=%.9g originalBodyFace=%d bodyVertices=%d/%d/%d armPoint=%s bodyPoint=%s"),
                                Side,FMath::Sqrt(DistanceSq),Data.BodyTriangles.Contains(Face),Face.X,Face.Y,Face.Z,
                                *Polygon[0].ToString(),*BodyPoints[0].ToString());
                        }
                    }
                    bClear=false;
                    if (!OutWitnesses) break;
                }
            }
            if (!bClear && OutWitnesses)
            {
                struct FContactRegion
                {
                    FVector Center;
                    FVector Normal;
                    double Objective = 0.;
                    FFlowArtsContactWitness Witness;
                };
                TArray<FContactRegion> Selected;
                double SelectedObjective = 0.;
                double SelectedWorstObjective = 0.;
                for (const FFlowArtsContactWitness& W : *OutWitnesses)
                {
                    if (W.Side != Side) continue;
                    const auto& Upper = Data.UpperTriangles[Side][W.UpperTriangleIndex];
                    const auto& Body = W.bClosedBody ? Data.ClosedBodyTriangles : Data.TorsoTriangles;
                    const FIntVector& B = Body[W.BodyTriangleIndex];
                    const FVector Normal = FVector::CrossProduct(Points[B.Y]-Points[B.X],
                        Points[B.Z]-Points[B.X]).GetSafeNormal() *
                        ((W.bContainment || W.bOrientedSurface) ? W.EscapeNormalSign : 1.);
                    const FVector Center = (Points[Upper.Vertices.X]+Points[Upper.Vertices.Y]+
                        Points[Upper.Vertices.Z])/3.;
                    const double Value = FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,
                        Transforms, TConstArrayView<FFlowArtsContactWitness>(&W, 1), PaddingCm);
                    Selected.Add({Center, Normal, Value, W});
                    SelectedObjective += Value;
                    SelectedWorstObjective = FMath::Max(SelectedWorstObjective, Value);
                }
                // Exhaustive checks are reserved for almost-cleared sides. At that
                // stage a shallow first contact can hide the actual worst triangle
                // in the same region, while broad failures still use bounded probes.
                const bool bRefineNearContacts = !Selected.IsEmpty() && SelectedObjective <= 1.;
#if WITH_DEV_AUTOMATION_TESTS
                const bool bScanContacts = bRefineNearContacts || bExhaustiveContactDiagnostic;
#else
                const bool bScanContacts = bRefineNearContacts;
#endif
                if (bScanContacts)
                {
                TArray<FContactRegion> Clusters;
                TArray<FContactRegion> FailedContacts;
                int32 FailedTriangles = 0;
                int32 WitnesslessFailures = 0;
                int32 MissedClusters = 0;
                double WorstObjective = 0.;
                int32 WorstTriangle = INDEX_NONE;
                for (int32 TriangleIndex = 0; TriangleIndex < Data.UpperTriangles[Side].Num(); ++TriangleIndex)
                {
                    const auto& Triangle = Data.UpperTriangles[Side][TriangleIndex];
                    const FPolygon Polygon = ExposedTriangle(Triangle, Points);
                    if (Polygon.Num() < 3) continue;
                    int32 FailureReason = 0, ContactTriangle = INDEX_NONE;
                    bool bContactClosedBody = false;
                    double EscapeNormalSign = 1.;
                    const bool bPass = (Data.bTorsoCoveredByClosedBody || (SupportClear & (1 << Side))) ?
                        Containment.Clear(Polygon, PaddingCm, Containment, &FailureReason,
                            &ContactTriangle, &bContactClosedBody, &EscapeNormalSign) :
                        Surface->Clear(Polygon, PaddingCm, Containment, &FailureReason,
                            &ContactTriangle, &bContactClosedBody, &EscapeNormalSign);
                    if (bPass) continue;
                    ++FailedTriangles;
                    if (ContactTriangle == INDEX_NONE) { ++WitnesslessFailures; continue; }
                    const auto& Body = bContactClosedBody ? Data.ClosedBodyTriangles : Data.TorsoTriangles;
                    const FIntVector& B = Body[ContactTriangle];
                    const FVector Center = (Points[Triangle.Vertices.X]+Points[Triangle.Vertices.Y]+
                        Points[Triangle.Vertices.Z])/3.;
                    const bool bOrientedSurface=bContactClosedBody && FailureReason!=3 &&
                        Containment.OrientCrossing(Polygon,ContactTriangle,EscapeNormalSign);
                    const FVector Normal = FVector::CrossProduct(Points[B.Y]-Points[B.X],
                        Points[B.Z]-Points[B.X]).GetSafeNormal() *
                        ((FailureReason == 3 || bOrientedSurface) ? EscapeNormalSign : 1.);
                    const FFlowArtsContactWitness W{static_cast<uint8>(Side), TriangleIndex,
                        ContactTriangle, bContactClosedBody, FailureReason == 3, EscapeNormalSign,bOrientedSurface};
                    const double Value = FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,
                        Transforms, TConstArrayView<FFlowArtsContactWitness>(&W, 1), PaddingCm);
                    if (Value > WorstObjective) { WorstObjective = Value; WorstTriangle = TriangleIndex; }
                    // A region is independent when its source is at least 5 cm away
                    // or the contacted surface normal differs by more than 30 degrees.
                    const auto SameRegion = [&](const FContactRegion& Other)
                    {
                        return (Center-Other.Center).SizeSquared() <= 25. &&
                            FVector::DotProduct(Normal, Other.Normal) >= .8660254;
                    };
                    const int32 Region = Clusters.IndexOfByPredicate(SameRegion);
                    const FContactRegion Candidate{Center, Normal, Value, W};
                    FailedContacts.Add(Candidate);
                    if (Region == INDEX_NONE)
                    {
                        Clusters.Add(Candidate);
                        if (!Selected.ContainsByPredicate(SameRegion)) ++MissedClusters;
                    }
                    else if (Value > Clusters[Region].Objective)
                        Clusters[Region] = Candidate;
                }
                if (bRefineNearContacts && !Clusters.IsEmpty())
                {
                    const auto StrongestFirst = [](const FContactRegion& A, const FContactRegion& B)
                    {
                        if (A.Objective != B.Objective) return A.Objective > B.Objective;
                        if (A.Witness.UpperTriangleIndex != B.Witness.UpperTriangleIndex)
                            return A.Witness.UpperTriangleIndex < B.Witness.UpperTriangleIndex;
                        return A.Witness.BodyTriangleIndex < B.Witness.BodyTriangleIndex;
                    };
                    Clusters.Sort(StrongestFirst);
                    FailedContacts.Sort(StrongestFirst);
                    OutWitnesses->RemoveAll([Side](const FFlowArtsContactWitness& W) { return W.Side == Side; });
                    // Preserve independent regions first. Remaining slots retain
                    // adjacent failing triangles, whose weighted vertices can move
                    // differently even when they touch the same body region.
                    const int32 PrimaryCount = FMath::Min(16, Clusters.Num());
                    for (int32 I = 0; I < PrimaryCount; ++I)
                        OutWitnesses->Add(Clusters[I].Witness);
                    int32 Added = PrimaryCount;
                    for (const FContactRegion& Contact : FailedContacts)
                    {
                        if (Added >= 16) break;
                        if (!OutWitnesses->ContainsByPredicate([&](const FFlowArtsContactWitness& W)
                        {
                            return W.Side == Side && W.UpperTriangleIndex == Contact.Witness.UpperTriangleIndex;
                        }))
                        {
                            OutWitnesses->Add(Contact.Witness);
                            ++Added;
                        }
                    }
                }
#if WITH_DEV_AUTOMATION_TESTS
                if (bExhaustiveContactDiagnostic)
                UE_LOG(LogFlowArtsSkin, Display,
                    TEXT("ExhaustiveContacts side=%d upper=%d failed=%d witnessless=%d clusters=%d missedClusters=%d selected=%d selectedObjective=%.9g selectedWorst=%.9g exhaustiveWorst=%.9g worstTriangle=%d refined=%d"),
                    Side, Data.UpperTriangles[Side].Num(), FailedTriangles, WitnesslessFailures,
                    Clusters.Num(), MissedClusters, Selected.Num(), SelectedObjective,
                    SelectedWorstObjective, WorstObjective, WorstTriangle, bRefineNearContacts);
#endif
                }
            }
            if(bClear)Clear|=1<<Side;
        }
        };
        if ((SideMask & 3) && Data.bTorsoCoveredByClosedBody) CertifySides(nullptr);
        else if (SideMask & 3)
        {
            TRACE_CPUPROFILER_EVENT_SCOPE(FlowArtsSkinnedLegacyTorsoPass);
            const FSurfaceTree Surface(Points,Data.TorsoTriangles,Data.TorsoTopology);
            CertifySides(&Surface);
        }
        if (BodyPropSides)
        {
            const FSurfaceTree Boundary(Points,Data.BodyPropBoundaryTriangles,Data.BodyPropBoundaryTopology);
            const auto BodyPropsClear = [&](TConstArrayView<FFlowArtsClearanceCapsule> Props, uint8 PropSide)
            {
                if (!ArmPropsClear(Containment,Props,PaddingCm,OutPropWitnesses,1,0,PropSide)) return false;
                for (int32 PropIndex = 0; PropIndex < Props.Num(); ++PropIndex)
                {
                    const auto& Prop = Props[PropIndex];
                    const double Radius = double(Prop.RadiusCm) + PaddingCm;
                    FBox Bounds(ForceInit); Bounds += Prop.Start; Bounds += Prop.End;
                    int32 ContactTriangle = INDEX_NONE;
                    if (!Boundary.Nodes.IsEmpty() && Boundary.NearCapsule(0,Prop.Start,Prop.End,
                        Bounds.ExpandBy(Radius),Radius*Radius,OutPropWitnesses?&ContactTriangle:nullptr))
                    {
                        if (OutPropWitnesses && ContactTriangle != INDEX_NONE)
                            OutPropWitnesses->Add({2,0,PropSide,ContactTriangle,PropIndex});
                        return false;
                    }
                }
                return true;
            };
            if ((BodyPropSides & 1) && BodyPropsClear(LeftHeldProps,0)) Clear |= 32;
            if ((BodyPropSides & 2) && BodyPropsClear(RightHeldProps,1)) Clear |= 64;
        }
    }
    if(bFullArms && !Data.FullArmTopology[0].Nodes.IsEmpty() && !Data.FullArmTopology[1].Nodes.IsEmpty())
    {
        TRACE_CPUPROFILER_EVENT_SCOPE(FlowArtsSkinnedArmPair);
        FSurfaceTree Left(Points,Data.FullArmTriangles[0],Data.FullArmTopology[0]);
        FSurfaceTree Right(Points,Data.FullArmTriangles[1],Data.FullArmTopology[1]);
        Left.Components=&Data.FullArmComponents[0];Left.ComponentCount=Data.FullArmComponentCount[0];
        Right.Components=&Data.FullArmComponents[1];Right.ComponentCount=Data.FullArmComponentCount[1];
        uint8 Failure=0;
        int32 PairLeftTriangle=INDEX_NONE,PairRightTriangle=INDEX_NONE;
        if(bQueryPair && ArmPairClear(Left,Right,Data.FullArmWitnessTriangles[0],Data.FullArmWitnessTriangles[1],
            PaddingCm,&Failure,&PairLeftTriangle,&PairRightTriangle))Clear|=4;
        if(OutArmPairWitnesses && bQueryPair)
        {
            TArray<TPair<double,FIntPoint>> NearPairs;
            // Include the same small target margin as preparation's objective.
            // These witnesses never grant a certificate or change its padding.
            Left.CollectTreeContacts(0,Right,0,PaddingCm+.05,NearPairs);
            for(const auto& Near:NearPairs)
            {
                FFlowArtsArmPairContactWitness Witness;
                Witness.LeftTriangleIndex=Near.Value.X;
                Witness.RightTriangleIndex=Near.Value.Y;
                OutArmPairWitnesses->Add(Witness);
            }
        }
        if (OutArmPairWitness && bQueryPair && Failure==2 &&
            Left.Triangles.IsValidIndex(PairLeftTriangle) && Right.Triangles.IsValidIndex(PairRightTriangle))
        {
            OutArmPairWitness->LeftTriangleIndex=PairLeftTriangle;
            OutArmPairWitness->RightTriangleIndex=PairRightTriangle;
        }
        // A proximal attachment contact must not hide an independent hand contact.
        // Prefer its witness for the bounded response while retaining the complete
        // arm query's verdict above. The open subset grants no certificate.
        if (OutArmPairWitness && bQueryPair && !(Clear & 4) &&
            !Data.HandTopology[0].Nodes.IsEmpty() && !Data.HandTopology[1].Nodes.IsEmpty())
        {
            FSurfaceTree LeftHand(Points,Data.HandTriangles[0],Data.HandTopology[0]);
            FSurfaceTree RightHand(Points,Data.HandTriangles[1],Data.HandTopology[1]);
            int32 L=INDEX_NONE,R=INDEX_NONE;
            if (LeftHand.NearTree(0,RightHand,0,PaddingCm,&L,&R) &&
                Data.HandFullArmTriangleIndices[0].IsValidIndex(L) &&
                Data.HandFullArmTriangleIndices[1].IsValidIndex(R))
            {
                OutArmPairWitness->LeftTriangleIndex=Data.HandFullArmTriangleIndices[0][L];
                OutArmPairWitness->RightTriangleIndex=Data.HandFullArmTriangleIndices[1][R];
                UE_LOG(LogFlowArtsSkin,VeryVerbose,TEXT("Hand pair exact near leftTri=%d rightTri=%d"),
                    OutArmPairWitness->LeftTriangleIndex,OutArmPairWitness->RightTriangleIndex);
            }
        }
        if (bQueryPair && Failure==2 && UE_LOG_ACTIVE(LogFlowArtsSkin, VeryVerbose) &&
            Left.Triangles.IsValidIndex(PairLeftTriangle) && Right.Triangles.IsValidIndex(PairRightTriangle))
        {
            const auto DominantBone=[&](int32 Side,int32 TriangleIndex) -> FString
            {
                const FIntVector& Triangle=Data.FullArmTriangles[Side][TriangleIndex];
                TMap<int32,double> Weights;
                for(int32 K=0;K<3;++K)
                {
                    if(!Data.Vertices.IsValidIndex(Triangle[K]))continue;
                    const auto& Vertex=Data.Vertices[Triangle[K]];
                    for(int32 I=Vertex.FirstInfluence;I<Vertex.FirstInfluence+Vertex.InfluenceCount && I<Data.Influences.Num();++I)
                        Weights.FindOrAdd(Data.Influences[I].Bone)+=Data.Influences[I].Weight;
                }
                int32 Bone=INDEX_NONE;double Weight=0.;
                for(const auto& Entry:Weights)if(Entry.Value>Weight){Bone=Entry.Key;Weight=Entry.Value;}
                return Data.ReferenceBoneNames.IsValidIndex(Bone)?Data.ReferenceBoneNames[Bone].ToString():TEXT("unknown");
            };
            const FIntVector& LT=Left.Triangles[PairLeftTriangle];
            const FIntVector& RT=Right.Triangles[PairRightTriangle];
            const FVector LeftPoints[3]={Points[LT.X],Points[LT.Y],Points[LT.Z]};
            const FVector RightPoints[3]={Points[RT.X],Points[RT.Y],Points[RT.Z]};
            int32 SharedVertices=0;
            for(int32 I=0;I<3;++I)
                SharedVertices+=(LT[I]==RT.X || LT[I]==RT.Y || LT[I]==RT.Z) ? 1 : 0;
            UE_LOG(LogFlowArtsSkin,VeryVerbose,
                TEXT("Arm pair exact near leftTri=%d rightTri=%d leftBone=%s rightBone=%s left=(%s;%s;%s) right=(%s;%s;%s) padding=%.9g surfaceDistance=%.9g sharedVertices=%d"),
                PairLeftTriangle,PairRightTriangle,*DominantBone(0,PairLeftTriangle),*DominantBone(1,PairRightTriangle),
                *Points[LT.X].ToString(),*Points[LT.Y].ToString(),*Points[LT.Z].ToString(),
                *Points[RT.X].ToString(),*Points[RT.Y].ToString(),*Points[RT.Z].ToString(),double(PaddingCm),
                FMath::Sqrt(TriangleDistanceSq(LeftPoints,RightPoints)),SharedVertices);
        }
        if ((PropSides & 1) && ArmPropsClear(Left, RightHeldProps, PaddingCm,
            OutPropWitnesses,0,0,1)) Clear |= 8;
        if ((PropSides & 2) && ArmPropsClear(Right, LeftHeldProps, PaddingCm,
            OutPropWitnesses,0,1,0)) Clear |= 16;
        // Opt in with -LogCmds="LogFlowArtsSkin Verbose". Reasons: 0 clear,
        // 1 incomplete, 2 padded surface contact, 3/4 left/right containment or ambiguous ray.
        UE_LOG(LogFlowArtsSkin,Verbose,TEXT("Skin query before lower-body covers upperMask=%d pairReason=%d components=%d/%d"),
            Clear&3,Failure,Left.ComponentCount,Right.ComponentCount);
    }
    // Open covers never use ray parity, synthetic caps, or absence of a nearby
    // triangle as proof. Every selected original-face component must have a
    // strict posed projection gap from every queried component/capsule.
    if (bOpenUpper || bOpenPair || OpenPropSides || OpenBodyPropSides)
    {
        const auto AxesFor = [&](int32 FirstBone, int32 SecondBone)
        {
            TArray<FVector> Axes = {FVector::ForwardVector, FVector::RightVector, FVector::UpVector};
            for (const int32 Bone : {FirstBone, SecondBone})
            {
                if (!Transforms.IsValidIndex(Bone) || !Transforms[Bone].IsValid())
                { Axes.Reset(); return Axes; }
                const FQuat Rotation = Transforms[Bone].GetRotation();
                for (const FVector Base : {FVector::ForwardVector, FVector::RightVector, FVector::UpVector})
                    Axes.Add(Rotation.RotateVector(Base));
            }
            return Axes;
        };
        const auto ComponentsSeparate = [&](const TArray<TArray<int32>>& A,
            const TArray<TArray<int32>>& B, const TArray<FVector>& Axes)
        {
            if (A.IsEmpty() || B.IsEmpty()) return false;
            for (const auto& LeftComponent : A)
                for (const auto& RightComponent : B)
                    if (!FlowArtsConservativeCover::SeparateVertices(
                        Points, LeftComponent, RightComponent, Axes, PaddingCm)) return false;
            return true;
        };
        const auto ComponentsClearProps = [&](const TArray<TArray<int32>>& Components,
            TConstArrayView<FFlowArtsClearanceCapsule> Props, const TArray<FVector>& Axes)
        {
            if (Components.IsEmpty() || Props.IsEmpty()) return false;
            for (const auto& Component : Components)
                for (const auto& Prop : Props)
                    if (!FlowArtsConservativeCover::SeparateCapsule(Points, Component,
                        Prop.Start, Prop.End, Prop.RadiusCm, Axes, PaddingCm)) return false;
            return true;
        };
        if (bOpenUpper)
        {
            for (int32 Side = 0; Side < 2; ++Side)
            {
                if (!(SideMask & (1 << Side)) || (Clear & (1 << Side))) continue;
                const TArray<FVector> Axes = AxesFor(Data.UncappedArmBone[Side], Data.OpenBodyBone);
                bool bSeparated = !Axes.IsEmpty() && !Data.UpperTriangles[Side].IsEmpty() &&
                    !Data.OpenBodyComponents.IsEmpty();
                bool bExposed = false;
                for (const auto& Triangle : Data.UpperTriangles[Side])
                {
                    if (!bSeparated) break;
                    if (!Points.IsValidIndex(Triangle.Vertices.X) ||
                        !Points.IsValidIndex(Triangle.Vertices.Y) ||
                        !Points.IsValidIndex(Triangle.Vertices.Z)) { bSeparated = false; break; }
                    const FPolygon Polygon = ExposedTriangle(Triangle, Points);
                    if (Polygon.Num() < 3) continue;
                    bExposed = true;
                    for (const auto& Component : Data.OpenBodyComponents)
                        if (!FlowArtsConservativeCover::SeparatePolygon(Points, Component,
                            TConstArrayView<FVector>(Polygon.GetData(), Polygon.Num()), Axes, PaddingCm))
                        { bSeparated = false; break; }
                }
                if (bSeparated && bExposed) Clear |= uint8(1 << Side);
            }
        }
        if (bOpenPair && ComponentsSeparate(Data.OpenArmComponents[0],
            Data.OpenArmComponents[1], AxesFor(Data.UncappedArmBone[0], Data.UncappedArmBone[1])))
            Clear |= 4;
        for (int32 Side = 0; Side < 2; ++Side)
        {
            if ((OpenPropSides & (1 << Side)) && ComponentsClearProps(
                Data.OpenArmComponents[Side], Side == 0 ? RightHeldProps : LeftHeldProps,
                AxesFor(Data.UncappedArmBone[Side], Data.UncappedArmBone[1 - Side])))
                Clear |= uint8(8 << Side);
            if ((OpenBodyPropSides & (1 << Side)) && ComponentsClearProps(
                Data.OpenBodyPropComponents, Side == 0 ? LeftHeldProps : RightHeldProps,
                AxesFor(Data.OpenBodyBone, Data.UncappedArmBone[Side])))
                Clear |= uint8(32 << Side);
        }
    }
    // Disconnected lower-body render pieces are absent from the closed trunk.
    // A separating projection bounds every point of every original mixed face,
    // and its convex interior. Overlapping/open covers are inconclusive, never
    // treated as exterior by ray parity or by absence of triangle crossings.
    for (const auto& Region : Data.LowerBodyRegions)
    {
        if (Region.Vertices.IsEmpty()) continue;
        if (!Transforms.IsValidIndex(Region.Bone)) { Clear&=~uint8(3|32|64); break; }
        TArray<FVector,TInlineAllocator<9>> Axes;
        for (const FVector Base : {FVector::ForwardVector,FVector::RightVector,FVector::UpVector}) Axes.Add(Base);
        for (const FVector Base : {FVector::ForwardVector,FVector::RightVector,FVector::UpVector})
            Axes.Add(Transforms[Region.Bone].GetRotation().RotateVector(Base).GetSafeNormal());
        const auto Interval=[&](const TArray<int32>& Vertices,const FVector& Axis,double& Lo,double& Hi)
        {
            Lo=TNumericLimits<double>::Max(); Hi=-TNumericLimits<double>::Max();
            if (Vertices.IsEmpty() || Axis.IsNearlyZero()) return false;
            for (int32 V : Vertices)
            {
                if (!Points.IsValidIndex(V)) return false;
                const double P=FVector::DotProduct(Points[V],Axis);
                if (!FMath::IsFinite(P)) return false;
                Lo=FMath::Min(Lo,P); Hi=FMath::Max(Hi,P);
            }
            return true;
        };
        const double Margin=double(PaddingCm)+1.e-4;
        const auto ArmSeparate=[&](int32 Side)
        {
            for (const FVector& Axis : Axes)
            {
                double Lo,Hi,ArmLo,ArmHi;
                if (!Interval(Region.Vertices,Axis,Lo,Hi) ||
                    !Interval(Data.UncappedArmVertices[Side],Axis,ArmLo,ArmHi)) return false;
                if (Hi+Margin<ArmLo || ArmHi+Margin<Lo) return true;
            }
            return false;
        };
        for (int32 Side=0; Side<2; ++Side)
        {
            if ((Clear&(1<<Side)) && !ArmSeparate(Side))
            {
                Clear&=~uint8(1<<Side);
                UE_LOG(LogFlowArtsSkin,Verbose,TEXT("Lower-body cover inconclusive arm=%d region=%s"),
                    Side,*Data.ReferenceBoneNames[Region.Bone].ToString());
            }
            const uint8 Bit=uint8(32<<Side);
            if (!(Clear&Bit)) continue;
            for (const auto& Prop : (Side ? RightHeldProps : LeftHeldProps))
            {
                bool bSeparated=false;
                for (const FVector& Axis : Axes)
                {
                    double Lo,Hi;
                    if (!Interval(Region.Vertices,Axis,Lo,Hi)) break;
                    const double P0=FVector::DotProduct(Prop.Start,Axis), P1=FVector::DotProduct(Prop.End,Axis);
                    if (Hi+Margin<FMath::Min(P0,P1)-Prop.RadiusCm ||
                        FMath::Max(P0,P1)+Prop.RadiusCm+Margin<Lo) { bSeparated=true; break; }
                }
                if (!bSeparated)
                {
                    Clear&=~Bit;
                    UE_LOG(LogFlowArtsSkin,Verbose,TEXT("Lower-body cover inconclusive heldProp=%d region=%s"),
                        Side,*Data.ReferenceBoneNames[Region.Bone].ToString());
                    break;
                }
            }
        }
    }
    UE_LOG(LogFlowArtsSkin,Verbose,TEXT("Skin query final mask=%u"),uint32(Clear));
    if (OutPropWitnesses && UE_LOG_ACTIVE(LogFlowArtsSkin, VeryVerbose))
    {
        uint8 LoggedSides=0;
        for (const auto& W : *OutPropWitnesses)
        {
            if (W.SurfaceKind != 0 || W.SurfaceSide > 1 ||
                !Data.FullArmTriangles[W.SurfaceSide].IsValidIndex(W.TriangleIndex)) continue;
            if (LoggedSides & (1 << W.SurfaceSide)) continue;
            LoggedSides |= 1 << W.SurfaceSide;
            const FIntVector& Triangle = Data.FullArmTriangles[W.SurfaceSide][W.TriangleIndex];
            TMap<int32,double> BoneWeights;
            for (int32 K = 0; K < 3; ++K)
            {
                if (!Data.Vertices.IsValidIndex(Triangle[K])) continue;
                const auto& Vertex = Data.Vertices[Triangle[K]];
                for (int32 I = Vertex.FirstInfluence;
                    I < Vertex.FirstInfluence + Vertex.InfluenceCount && I < Data.Influences.Num(); ++I)
                {
                    const auto& Influence = Data.Influences[I];
                    BoneWeights.FindOrAdd(Influence.Bone) += Influence.Weight;
                }
            }
            int32 DominantBone = INDEX_NONE;
            double DominantWeight = 0.;
            for (const auto& Entry : BoneWeights)
                if (Entry.Value > DominantWeight) { DominantBone = Entry.Key; DominantWeight = Entry.Value; }
            const FString BoneName = Data.ReferenceBoneNames.IsValidIndex(DominantBone)
                ? Data.ReferenceBoneNames[DominantBone].ToString() : TEXT("unknown");
            UE_LOG(LogFlowArtsSkin, VeryVerbose,
                TEXT("Prop contact arm=%u prop=%u triangle=%d capsule=%d containment=%d dominantBone=%s weight=%.3f"),
                unsigned(W.SurfaceSide), unsigned(W.PropSide), W.TriangleIndex, W.CapsuleIndex,
                W.bContainment, *BoneName, DominantWeight / 3.);
        }
    }
    return Clear;
}

bool FFlowArtsSkinnedClearance::FindHandPropDepthEscape(const FFlowArtsSkinnedClearanceData& Data,
    TConstArrayView<FTransform> Transforms,
    TConstArrayView<FFlowArtsClearanceCapsule> LeftProps,
    TConstArrayView<FFlowArtsClearanceCapsule> RightProps,
    const FVector& Normal, double Maximum, double& OutDepth, float Padding)
{
    OutDepth=0.;
    if(!Normal.IsNormalized() || !FMath::IsFinite(Maximum) || Maximum<=0. ||
        !FMath::IsFinite(Padding) || Padding<0.) return false;
    TArray<FVector> Points; Points.Init(FVector::ZeroVector,Data.Vertices.Num());
    TSet<int32> Needed;
    for(int32 Side=0;Side<2;++Side)
    {
        if(Data.HandTriangles[Side].IsEmpty() || Data.HandTopology[Side].Nodes.IsEmpty()) return false;
        for(const auto& T:Data.HandTriangles[Side]) for(int32 K=0;K<3;++K) Needed.Add(T[K]);
    }
    for(int32 Index:Needed)
    {
        if(!Data.Vertices.IsValidIndex(Index)) return false;
        const auto& V=Data.Vertices[Index];
        if(V.InfluenceCount<=0) return false;
        for(int32 I=V.FirstInfluence;I<V.FirstInfluence+V.InfluenceCount;++I)
        {
            if(!Data.Influences.IsValidIndex(I)) return false;
            const auto& W=Data.Influences[I];
            if(!Transforms.IsValidIndex(W.Bone) || Transforms[W.Bone].ContainsNaN()) return false;
            Points[Index]+=Transforms[W.Bone].TransformPosition(W.BoneLocalPosition)*W.Weight;
        }
        if(Points[Index].ContainsNaN()) return false;
    }
    FSurfaceTree Left(Points,Data.HandTriangles[0],Data.HandTopology[0]);
    FSurfaceTree Right(Points,Data.HandTriangles[1],Data.HandTopology[1]);
    auto Clear=[&](double Depth)
    {
        for(int32 Side=0;Side<2;++Side)
        {
            const auto& Tree=Side ? Right : Left;
            // Open hand surfaces guide search only. Rebuilt IK receives the
            // complete solid query before this candidate can be accepted.
            const FVector Shift=Normal*((Side ? 2. : -2.)*Depth);
            for(const auto& Prop:(Side ? LeftProps : RightProps))
            {
                if(Prop.Start.ContainsNaN() || Prop.End.ContainsNaN() ||
                    !FMath::IsFinite(Prop.RadiusCm) || Prop.RadiusCm<0.) return false;
                const FVector A=Prop.Start+Shift,B=Prop.End+Shift;
                const double Radius=Prop.RadiusCm+Padding;
                FBox Bounds(ForceInit); Bounds+=A; Bounds+=B;
                if(Tree.NearCapsule(0,A,B,Bounds.ExpandBy(Radius),Radius*Radius)) return false;
            }
        }
        return true;
    };
    if(Clear(0.) || !Clear(Maximum)) return false;
    double Low=0.,High=Maximum;
    // Preserve a measured clear upper endpoint. Multiple contact intervals may
    // exist; this does not claim the globally smallest escape. Intermediate
    // samples never enter the published playback trajectory.
    for(int32 I=0;I<12;++I)
    {
        const double Mid=(Low+High)*.5;
        if(Clear(Mid)) High=Mid; else Low=Mid;
    }
    OutDepth=High;
    return High>0. && High<=Maximum;
}

double FFlowArtsSkinnedClearance::EvaluateContactWitnesses(const FFlowArtsSkinnedClearanceData& Data,
    TConstArrayView<FTransform> Transforms, TConstArrayView<FFlowArtsContactWitness> Witnesses,
    float PaddingCm)
{
    if (Transforms.Num() != Data.ReferenceBoneCount || !FMath::IsFinite(PaddingCm) || PaddingCm < 0.f)
        return TNumericLimits<double>::Max();
    TMap<int32,FVector> Skinned;
    const auto Skin = [&](int32 Index, FVector& Out) -> bool {
        if (const FVector* Cached = Skinned.Find(Index)) { Out = *Cached; return true; }
        if (!Data.Vertices.IsValidIndex(Index)) return false;
        const auto& Vertex = Data.Vertices[Index];
        if (Vertex.InfluenceCount < 1 || Vertex.FirstInfluence < 0 ||
            Vertex.FirstInfluence + Vertex.InfluenceCount > Data.Influences.Num()) return false;
        Out = FVector::ZeroVector;
        for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
        {
            const auto& Influence = Data.Influences[I];
            if (!Transforms.IsValidIndex(Influence.Bone) || Transforms[Influence.Bone].ContainsNaN()) return false;
            Out += Transforms[Influence.Bone].TransformPosition(Influence.BoneLocalPosition) * Influence.Weight;
        }
        if (Out.ContainsNaN()) return false;
        Skinned.Add(Index, Out);
        return true;
    };
    struct FObjectiveRegion
    {
        uint8 Side;
        bool bContainment;
        FVector Center;
        FVector Normal;
        double WorstShortfallSq;
    };
    TArray<FObjectiveRegion,TInlineAllocator<32>> Regions;
    for (const FFlowArtsContactWitness& Witness : Witnesses)
    {
        if (Witness.Side > 1 || !Data.UpperTriangles[Witness.Side].IsValidIndex(Witness.UpperTriangleIndex))
            return TNumericLimits<double>::Max();
        const auto& Body = Witness.bClosedBody ? Data.ClosedBodyTriangles : Data.TorsoTriangles;
        if (!Body.IsValidIndex(Witness.BodyTriangleIndex)) return TNumericLimits<double>::Max();
        const auto& UpperTriangle = Data.UpperTriangles[Witness.Side][Witness.UpperTriangleIndex];
        const FIntVector& BodyTriangle = Body[Witness.BodyTriangleIndex];
        FVector UpperPoints[3], BodyPoints[3];
        for (int32 K = 0; K < 3; ++K)
        {
            if (!Skin(UpperTriangle.Vertices[K], UpperPoints[K]) ||
                !Skin(BodyTriangle[K], BodyPoints[K])) return TNumericLimits<double>::Max();
        }
        const FPolygon Polygon = ExposedTriangle(UpperTriangle, UpperPoints);
        if (Polygon.Num() < 3) continue;
        double ShortfallSq = 0.;
        if (Witness.bContainment || Witness.bOrientedSurface)
        {
            const FVector Normal=FVector::CrossProduct(BodyPoints[1]-BodyPoints[0],BodyPoints[2]-BodyPoints[0]).GetSafeNormal();
            if(Normal.IsNearlyZero() || !FMath::IsFinite(Witness.EscapeNormalSign) ||
                FMath::Abs(Witness.EscapeNormalSign)!=1.)return TNumericLimits<double>::Max();
            double MinimumSigned=TNumericLimits<double>::Max();
            for(const FVector& Point:Polygon)MinimumSigned=FMath::Min(MinimumSigned,
                FVector::DotProduct(Point-BodyPoints[0],Normal)*Witness.EscapeNormalSign);
            const double Shortfall=FMath::Max(0.,static_cast<double>(PaddingCm)-MinimumSigned);
            ShortfallSq=Shortfall*Shortfall;
        }
        else
        {
            double Minimum = TNumericLimits<double>::Max();
            double CrossingDepth = 0.;
            for (int32 I = 1; I+1 < Polygon.Num(); ++I)
            {
                const FVector A[3] = {Polygon[0], Polygon[I], Polygon[I+1]};
                const double DistanceSq = TriangleDistanceSq(A, BodyPoints);
                Minimum = FMath::Min(Minimum, DistanceSq);
                if (DistanceSq <= 1.e-12)
                    CrossingDepth = FMath::Max(CrossingDepth, TriangleCrossingExitDepth(A, BodyPoints));
            }
            const double Shortfall = CrossingDepth > 0.
                ? static_cast<double>(PaddingCm) + CrossingDepth
                : FMath::Max(0., static_cast<double>(PaddingCm) - FMath::Sqrt(Minimum));
            ShortfallSq = Shortfall * Shortfall;
        }
        const FVector Center = (UpperPoints[0] + UpperPoints[1] + UpperPoints[2]) / 3.;
        const FVector BodyNormal = FVector::CrossProduct(BodyPoints[1]-BodyPoints[0],
            BodyPoints[2]-BodyPoints[0]).GetSafeNormal() *
            ((Witness.bContainment || Witness.bOrientedSurface) ? Witness.EscapeNormalSign : 1.);
        const int32 Region = Regions.IndexOfByPredicate([&](const FObjectiveRegion& Existing)
        {
            return Existing.Side == Witness.Side && Existing.bContainment == Witness.bContainment &&
                !BodyNormal.IsNearlyZero() && !Existing.Normal.IsNearlyZero() &&
                (Existing.Center-Center).SizeSquared() <= 25. &&
                FVector::DotProduct(Existing.Normal,BodyNormal) >= .8660254;
        });
        if (Region == INDEX_NONE)
            Regions.Add({Witness.Side,Witness.bContainment,Center,BodyNormal,ShortfallSq});
        else
            Regions[Region].WorstShortfallSq = FMath::Max(Regions[Region].WorstShortfallSq,ShortfallSq);
    }
    double Objective = 0.;
    for (const FObjectiveRegion& Region : Regions) Objective += Region.WorstShortfallSq;
    return Objective;
}

double FFlowArtsSkinnedClearance::EvaluateArmPairContactWitness(const FFlowArtsSkinnedClearanceData& Data,
    TConstArrayView<FTransform> Transforms, const FFlowArtsArmPairContactWitness& Witness, float PaddingCm)
{
    if (Transforms.Num() != Data.ReferenceBoneCount || !FMath::IsFinite(PaddingCm) || PaddingCm < 0.f ||
        !Data.FullArmTriangles[0].IsValidIndex(Witness.LeftTriangleIndex) ||
        !Data.FullArmTriangles[1].IsValidIndex(Witness.RightTriangleIndex))
        return TNumericLimits<double>::Max();
    FVector Points[2][3];
    for (int32 Side = 0; Side < 2; ++Side)
    {
        const FIntVector& Triangle = Data.FullArmTriangles[Side][Side == 0 ?
            Witness.LeftTriangleIndex : Witness.RightTriangleIndex];
        for (int32 K = 0; K < 3; ++K)
        {
            if (!Data.Vertices.IsValidIndex(Triangle[K])) return TNumericLimits<double>::Max();
            const auto& Vertex = Data.Vertices[Triangle[K]];
            if (Vertex.InfluenceCount < 1 || Vertex.FirstInfluence < 0 ||
                Vertex.FirstInfluence + Vertex.InfluenceCount > Data.Influences.Num())
                return TNumericLimits<double>::Max();
            FVector& Point = Points[Side][K];
            Point = FVector::ZeroVector;
            for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
            {
                const auto& Influence = Data.Influences[I];
                if (!Transforms.IsValidIndex(Influence.Bone) || Transforms[Influence.Bone].ContainsNaN())
                    return TNumericLimits<double>::Max();
                Point += Transforms[Influence.Bone].TransformPosition(Influence.BoneLocalPosition) * Influence.Weight;
            }
            if (Point.ContainsNaN()) return TNumericLimits<double>::Max();
        }
    }
    const double DistanceSq = TriangleDistanceSq(Points[0], Points[1]);
    const double CrossingDepth = DistanceSq <= 1.e-12 ?
        TriangleCrossingExitDepth(Points[0], Points[1]) : 0.;
    const double Shortfall = CrossingDepth > 0. ? double(PaddingCm) + CrossingDepth :
        FMath::Max(0., double(PaddingCm) - FMath::Sqrt(DistanceSq));
    return Shortfall * Shortfall;
}

double FFlowArtsSkinnedClearance::EvaluatePropContactWitnesses(const FFlowArtsSkinnedClearanceData& Data,
    TConstArrayView<FTransform> Transforms, TConstArrayView<FFlowArtsPropContactWitness> Witnesses,
    TConstArrayView<FFlowArtsClearanceCapsule> LeftHeldProps,
    TConstArrayView<FFlowArtsClearanceCapsule> RightHeldProps, float PaddingCm)
{
    if (Transforms.Num() != Data.ReferenceBoneCount || !FMath::IsFinite(PaddingCm) || PaddingCm < 0.f)
        return TNumericLimits<double>::Max();
    TMap<int32,FVector> Skinned;
    const auto Skin = [&](int32 Index, FVector& Out) -> bool
    {
        if (const FVector* Cached = Skinned.Find(Index)) { Out = *Cached; return true; }
        if (!Data.Vertices.IsValidIndex(Index)) return false;
        const auto& Vertex = Data.Vertices[Index];
        if (Vertex.InfluenceCount < 1 || Vertex.FirstInfluence < 0 ||
            Vertex.FirstInfluence + Vertex.InfluenceCount > Data.Influences.Num()) return false;
        Out = FVector::ZeroVector;
        for (int32 I = Vertex.FirstInfluence; I < Vertex.FirstInfluence + Vertex.InfluenceCount; ++I)
        {
            const auto& Influence = Data.Influences[I];
            if (!Transforms.IsValidIndex(Influence.Bone) || Transforms[Influence.Bone].ContainsNaN()) return false;
            Out += Transforms[Influence.Bone].TransformPosition(Influence.BoneLocalPosition) * Influence.Weight;
        }
        if (Out.ContainsNaN()) return false;
        Skinned.Add(Index, Out);
        return true;
    };
    double Objective = 0.;
    TMap<uint32,double> PropContactObjectives;
    for (const auto& W : Witnesses)
    {
        const auto Props = W.PropSide == 0 ? LeftHeldProps : RightHeldProps;
        if (W.PropSide > 1 || W.CapsuleIndex < 0 || W.CapsuleIndex >= Props.Num() ||
            W.SurfaceKind > 2 || W.SurfaceSide > 1) return TNumericLimits<double>::Max();
        const auto& Triangles = W.SurfaceKind == 0 ? Data.FullArmTriangles[W.SurfaceSide] :
            W.SurfaceKind == 1 ? Data.ClosedBodyTriangles : Data.BodyPropBoundaryTriangles;
        if (!Triangles.IsValidIndex(W.TriangleIndex))
            return TNumericLimits<double>::Max();
        const auto& T = Triangles[W.TriangleIndex];
        FVector P[3];
        if (!Skin(T.X,P[0]) || !Skin(T.Y,P[1]) || !Skin(T.Z,P[2]))
            return TNumericLimits<double>::Max();
        const auto& Prop = Props[W.CapsuleIndex];
        if (Prop.Start.ContainsNaN() || Prop.End.ContainsNaN() ||
            !FMath::IsFinite(Prop.RadiusCm) || Prop.RadiusCm <= 0.f)
            return TNumericLimits<double>::Max();
        const double Radius = double(Prop.RadiusCm) + PaddingCm;
        double Shortfall;
        if (W.bContainment)
        {
            const FVector Normal = FVector::CrossProduct(P[1]-P[0],P[2]-P[0]).GetSafeNormal() * W.EscapeNormalSign;
            if (Normal.IsNearlyZero()) return TNumericLimits<double>::Max();
            // A contained capsule must move its tested axis start outside this
            // local face. This plane only guides search; full ray parity certifies.
            Shortfall = FMath::Max(0., Radius - FVector::DotProduct(Prop.Start-P[0],Normal));
        }
        else
        {
            const double DistanceSq = SegmentTriangleDistanceSq(Prop.Start,Prop.End,P);
            if (!FMath::IsFinite(DistanceSq)) return TNumericLimits<double>::Max();
            const double CrossingDepth = DistanceSq <= 1.e-16 ?
                SegmentTriangleCrossingExitDepth(Prop.Start,Prop.End,P) : 0.;
            Shortfall = FMath::Max(0.,Radius-FMath::Sqrt(DistanceSq)+CrossingDepth);
        }
        // Adjacent triangles describe the same obstacle. The worst contact per
        // capsule avoids making the response depend on local tessellation density.
        const uint32 Key=(uint32(W.SurfaceKind)<<24)|(uint32(W.SurfaceSide)<<16)|
            (uint32(W.PropSide)<<8)|uint32(W.CapsuleIndex);
        double& Worst=PropContactObjectives.FindOrAdd(Key);
        Worst=FMath::Max(Worst,Shortfall*Shortfall);
    }
    for (const auto& Contact : PropContactObjectives) Objective+=Contact.Value;
    return Objective;
}

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsSkinnedContainmentWitnessTest,
    "FlowArts.Runtime.ArmClearance.SkinnedContainmentWitness",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsSkinnedContainmentWitnessTest::RunTest(const FString& Parameters)
{
    FFlowArtsSkinnedClearanceData Data;Data.ReferenceBoneCount=2;
    const TArray<FVector> Points={FVector(0,0,0),FVector(10,0,0),FVector(0,10,0),FVector(0,0,10),
        FVector(3,3,1),FVector(3.2,3,1),FVector(3,3.2,1)};
    for(int32 I=0;I<Points.Num();++I)
    {
        Data.Vertices.Add({I,1});Data.Influences.Add({I<4?0:1,Points[I],1.f});
        Data.UpperReferencedVertices.Add(I);
    }
    Data.UpperReferencedBones={0,1};
    Data.TorsoTriangles={FIntVector(0,2,1),FIntVector(0,1,3),FIntVector(1,2,3),FIntVector(2,0,3)};
    Data.ClosedBodyTriangles=Data.TorsoTriangles;Data.ClosedBodyComponents={0,0,0,0};
    Data.BodyComponentCount=1;Data.bTorsoCoveredByClosedBody=true;
    const FSurfaceTree Tree(Points,Data.ClosedBodyTriangles);
    Data.ClosedBodyTopology.Nodes=Tree.Nodes;Data.ClosedBodyTopology.Order=Tree.Order;
    Data.UpperTriangles[0].Add({FIntVector(4,5,6),FVector(.5,.5,.5)});
    TArray<FTransform> Frames={FTransform::Identity,FTransform::Identity};
    TArray<FFlowArtsContactWitness> Witnesses;
    TestEqual(TEXT("Wholly contained upper triangle fails full certificate"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Frames,.3f,1,false,&Witnesses),uint8(0));
    if(!TestTrue(TEXT("Interior rejection supplies a closed-body containment witness"),
        Witnesses.Num()==1 && Witnesses[0].bContainment && Witnesses[0].bClosedBody))return false;
    const double Inside=FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Frames,Witnesses,.3f);
    Frames[1].SetTranslation(FVector(0,0,-.8));
    const double Toward=FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Frames,Witnesses,.3f);
    TestTrue(TEXT("Escape objective decreases toward the nearest boundary"),Inside>Toward && Toward>0.);
    TestEqual(TEXT("Closer interior still fails full certificate"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Frames,.3f,1,false),uint8(0));
    Frames[1].SetTranslation(FVector(0,0,-1.1));
    TestEqual(TEXT("Outside without padding still fails full certificate"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Frames,.3f,1,false),uint8(0));
    const double Near=FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Frames,Witnesses,.3f);
    TestTrue(TEXT("Objective continues decreasing across the boundary"),Near<Toward && Near>0.);
    Frames[1].SetTranslation(FVector(0,0,-1.4));
    TestEqual(TEXT("Padded exterior has zero escape shortfall"),
        FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Frames,Witnesses,.3f),0.);
    TestEqual(TEXT("Only padded exterior passes full certificate"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Frames,.3f,1,false),uint8(1));
    // Escape through another face: the old local plane still has a positive
    // objective, but must not constrain a genuinely clear current candidate.
    Frames[1].SetTranslation(FVector(10,0,0));
    TestTrue(TEXT("An obsolete containment plane can penalize a clear exterior"),
        FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Frames,Witnesses,.3f)>0.);
    const TArray<FFlowArtsContactWitness> InitialWitnesses=Witnesses;
    TestEqual(TEXT("A fresh exterior query passes despite the previous escape plane"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Frames,.3f,1,false,&Witnesses),uint8(1));
    TestTrue(TEXT("A clear query removes obsolete containment witnesses"),Witnesses.IsEmpty());
    Frames[1]=FTransform::Identity;
    FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Frames,.3f,1,false,&Witnesses);
    TestEqual(TEXT("A new interior query publishes its own contact"),Witnesses.Num(),1);
    const TArray<FTransform> InvalidFrames;
    FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,InvalidFrames,.3f,1,false,&Witnesses);
    TestTrue(TEXT("An invalid invoked query publishes no stale contact"),Witnesses.IsEmpty());
    Witnesses=InitialWitnesses;
    const FTransform BodyMove(FQuat(FVector(1,2,3).GetSafeNormal(),.73),FVector(21,-8,4));
    Frames[0]=BodyMove;Frames[1]=FTransform(FVector(0,0,-.8))*BodyMove;
    TestTrue(TEXT("Witness plane follows the exact transformed body triangle"),FMath::IsNearlyEqual(
        FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Frames,Witnesses,.3f),Toward,1.e-9));
    TestEqual(TEXT("Transformed interior remains rejected by full certificate"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Frames,.3f,1,false),uint8(0));
    {
        auto CrossingData=Data;
        CrossingData.Influences[4].BoneLocalPosition=FVector(3,3,-.5);
        CrossingData.Influences[5].BoneLocalPosition=FVector(3.2,3,.5);
        CrossingData.Influences[6].BoneLocalPosition=FVector(3,3.2,.5);
        TArray<FTransform> CrossingFrames={FTransform::Identity,FTransform::Identity};
        TArray<FFlowArtsContactWitness> CrossingWitnesses;
        TestEqual(TEXT("A true boundary crossing remains rejected"),
            FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(CrossingData,CrossingFrames,.3f,1,false,&CrossingWitnesses),uint8(0));
        TestTrue(TEXT("Closed surface crossing carries a verified exterior direction"),
            CrossingWitnesses.ContainsByPredicate([](const auto& W){return W.bOrientedSurface && !W.bContainment;}));
        const double Crossing=FFlowArtsSkinnedClearance::EvaluateContactWitnesses(CrossingData,CrossingFrames,CrossingWitnesses,.3f);
        CrossingFrames[1].SetTranslation(FVector(0,0,-.1));
        const double Outward=FFlowArtsSkinnedClearance::EvaluateContactWitnesses(CrossingData,CrossingFrames,CrossingWitnesses,.3f);
        CrossingFrames[1].SetTranslation(FVector(0,0,.1));
        const double Inward=FFlowArtsSkinnedClearance::EvaluateContactWitnesses(CrossingData,CrossingFrames,CrossingWitnesses,.3f);
        TestTrue(TEXT("Crossing descent chooses exterior rather than deeper containment"),Outward<Crossing && Crossing<Inward);
    }
    // A distant second collision appears after many harmless imported faces.
    // Clearing only the first region must not erase the search objective.
    Data.ReferenceBoneCount=3;Data.UpperReferencedBones.Add(2);Frames={FTransform::Identity,FTransform::Identity,FTransform::Identity};
    const auto AddVertex=[&](FVector Position,int32 Bone) {
        const int32 Index=Data.Vertices.Num();Data.Vertices.Add({Data.Influences.Num(),1});
        Data.Influences.Add({Bone,Position,1.f});Data.UpperReferencedVertices.Add(Index);return Index;
    };
    const int32 Far=AddVertex(FVector(100,0,0),0);
    AddVertex(FVector(100,1,0),0);AddVertex(FVector(100,0,1),0);
    for(int32 I=0;I<100;++I)Data.UpperTriangles[0].Add({FIntVector(Far,Far+1,Far+2),FVector(.5,.5,.5)});
    const int32 Remote=AddVertex(FVector(6,1,1),2);
    AddVertex(FVector(6.2,1,1),2);AddVertex(FVector(6,1.2,1),2);
    Data.UpperTriangles[0].Add({FIntVector(Remote,Remote+1,Remote+2),FVector(.5,.5,.5)});
    Witnesses.Reset();
    TestEqual(TEXT("Disconnected interior regions still fail full certification"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Frames,.3f,1,false,&Witnesses),uint8(0));
    TestTrue(TEXT("First rejected region remains a witness"),Witnesses.ContainsByPredicate(
        [](const FFlowArtsContactWitness& W){return W.UpperTriangleIndex==0;}));
    TestTrue(TEXT("Distributed probes discover a contact more than24 indices away"),Witnesses.ContainsByPredicate(
        [](const FFlowArtsContactWitness& W){return W.UpperTriangleIndex==101;}));
    TestTrue(TEXT("Distributed witness count remains bounded per side"),Witnesses.Num()<=4);
    Frames[1].SetTranslation(FVector(0,0,-1.4));
    TestTrue(TEXT("Clearing the first region leaves the remote escape objective positive"),
        FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Frames,Witnesses,.3f)>0.);
    TestEqual(TEXT("Remote actual containment still rejects after first region clears"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Frames,.3f,1,false),uint8(0));
    Frames[2].SetTranslation(FVector(0,0,-1.4));
    TestEqual(TEXT("Both separated padded regions pass full certification"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Frames,.3f,1,false),uint8(1));
    TestEqual(TEXT("Both escaped regions have zero witness objective"),
        FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Frames,Witnesses,.3f),0.);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsSkinnedTouchingBoundaryTest,
    "FlowArts.Runtime.ArmClearance.SkinnedTouchingBoundary",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsSkinnedTouchingBoundaryTest::RunTest(const FString& Parameters)
{
    // Two tetrahedral regions share one vertex, but no edge. Their open face
    // boundaries touch there; both must be capped without losing original faces.
    const TArray<FVector> Points={FVector(0,0,0),FVector(2,0,0),FVector(0,2,0),FVector(0,0,2),
        FVector(-2,0,0),FVector(0,-2,0),FVector(0,0,-2)};
    TArray<int32> Weld;for(int32 I=0;I<Points.Num();++I)Weld.Add(I);
    const TArray<FIntVector> Original={FIntVector(0,1,3),FIntVector(1,2,3),FIntVector(2,0,3),
        FIntVector(0,6,4),FIntVector(4,6,5),FIntVector(5,6,0)};
    TArray<FIntVector> Closed=Original;TArray<int32> Components,Witnesses;
    if(!TestTrue(TEXT("Touching boundaries close through their separate oriented face fans"),
        CloseArmRegion(Closed,Weld,Points,Components,Witnesses)))return false;
    TestEqual(TEXT("Both missing faces are capped"),Closed.Num(),8);
    TestEqual(TEXT("Touching regions retain separate edge components"),Witnesses.Num(),2);
    for(int32 I=0;I<Original.Num();++I)TestTrue(TEXT("Every original face is retained"),Closed[I]==Original[I]);
    FSurfaceTree Surface(Points,Closed);Surface.Components=&Components;Surface.ComponentCount=Witnesses.Num();
    TestFalse(TEXT("Positive region still contains its interior"),Surface.Outside(FVector(.2,.2,.2)));
    TestFalse(TEXT("Negative region still contains its interior"),Surface.Outside(FVector(-.2,-.2,-.2)));
    TestTrue(TEXT("Distant points remain outside"),Surface.Outside(FVector(3,3,3)));
    const FPolygon Crossing={FVector(.2,.2,.2),FVector(3,.2,.2),FVector(3,.4,.2)};
    TestFalse(TEXT("Closing touching boundaries does not waive true surface crossings"),Surface.Clear(Crossing,.3,Surface));
    const FPolygon Near={FVector(.2,.2,-.1),FVector(.4,.2,-.1),FVector(.2,.4,-.1)};
    TestFalse(TEXT("Cap padding remains enforced"),Surface.Clear(Near,.3,Surface));
    TArray<FIntVector> Bad=Original;Bad.Add(Original[0]);Components.Reset();Witnesses.Reset();
    TestFalse(TEXT("Duplicate/nonmanifold faces remain conservatively invalid"),
        CloseArmRegion(Bad,Weld,Points,Components,Witnesses));
    TArray<FIntVector> WalkCaps;
    TestTrue(TEXT("A repeated-vertex boundary walk splits into simple loops"),
        CapBoundaryWalk({0,1,2,0,4,5},Points,WalkCaps));
    TestEqual(TEXT("Both pinched-walk lobes retain their cap"),WalkCaps.Num(),2);
    const TArray<FVector> Square={FVector(0,0,0),FVector(2,0,0),FVector(2,2,0),FVector(0,2,0)};
    TSet<uint64> Blocked;Blocked.Add((uint64(1)<<32)|uint32(3));TArray<FIntVector> Constrained;
    TestTrue(TEXT("Cap chooses another ear instead of reusing an original interior edge"),
        CapLoop({0,1,2,3},Square,Constrained,&Blocked));
    for(const FIntVector& T:Constrained)for(int32 K=0;K<3;++K)
        TestFalse(TEXT("Forbidden interior diagonal is never introduced"),Blocked.Contains(
            (uint64(FMath::Min(T[K],T[(K+1)%3]))<<32)|uint32(FMath::Max(T[K],T[(K+1)%3]))));
    Blocked.Add((uint64(0)<<32)|uint32(2));Constrained.Reset();
    TestFalse(TEXT("No valid cap is conservatively rejected"),CapLoop({0,1,2,3},Square,Constrained,&Blocked));
    // A measured simple nonplanar seam crosses in all three axis projections.
    const TArray<FVector> ObliquePoints={FVector(-23.4009304047,-6.83622217178,314.30569458),
        FVector(-22.5666790009,-3.78634285927,311.61831665),
        FVector(-20.0717201233,0.241024538875,308.803405762),
        FVector(-11.154967308,5.99907684326,311.588409424),
        FVector(-7.32444953918,9.81538963318,307.13104248),
        FVector(-7.20559740067,10.3086662292,307.459289551),
        FVector(-7.19967699051,10.7053918839,307.33682251),
        FVector(-12.3641023636,7.59229421616,311.224334717),
        FVector(-18.0907020569,4.88598108292,311.643920898),
        FVector(-19.9767189026,0.934340059757,315.295928955),
        FVector(-21.1203422546,-2.34086799622,317.526397705),
        FVector(-18.6240787506,-5.09680080414,318.515075684),
        FVector(-18.4018478394,-8.27563381195,318.718353271),
        FVector(-17.6570701599,-10.71829319,318.641387939),
        FVector(-16.629114151,-10.0036067963,318.737792969),
        FVector(-15.8898439407,-12.4460506439,319.29196167),
        FVector(-15.6601037979,-12.1848592758,318.894134521),
        FVector(-16.3391704559,-9.88207054138,318.110961914),
        FVector(-16.5311489105,-10.0384159088,317.989105225),
        FVector(-17.0187721252,-8.02739143372,317.831359863),
        FVector(-22.7317256927,-9.8178024292,314.647827148)};
    TArray<int32> ObliqueLoop;for(int32 I=0;I<ObliquePoints.Num();++I)ObliqueLoop.Add(I);
    for(int32 Axis=0;Axis<3;++Axis)
    {
        TArray<FIntVector> AxisCaps;
        TestFalse(TEXT("This seam needs an oblique projection"),CapLoopProjected(ObliqueLoop,ObliquePoints,AxisCaps,Axis));
    }
    TArray<FIntVector> ObliqueCaps;
    TestTrue(TEXT("A validated oblique projection closes the complete seam"),CapLoop(ObliqueLoop,ObliquePoints,ObliqueCaps));
    TestEqual(TEXT("Oblique ear clipping keeps every boundary vertex"),ObliqueCaps.Num(),ObliquePoints.Num()-2);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsSkinnedBodyCatalogTest,
    "FlowArts.Runtime.ArmClearance.SkinnedBodyCatalog",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsSkinnedBodyCatalogTest::RunTest(const FString& Parameters)
{
    FString Json;TSharedPtr<FJsonObject> Catalog;const TArray<TSharedPtr<FJsonValue>>* Characters=nullptr;
    if(!TestTrue(TEXT("Installed character catalog loads"),FFileHelper::LoadFileToString(Json,
        *(FPaths::ProjectContentDir()/TEXT("Data/characters.json")))&&
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Catalog)&&Catalog.IsValid()&&
        Catalog->TryGetArrayField(TEXT("characters"),Characters)))return false;
    TestEqual(TEXT("All sixteen deployed rigs are checked"),Characters->Num(),16);
    for(const auto& Value:*Characters)
    {
        const TSharedPtr<FJsonObject>* Entry=nullptr;FString Id,MeshPath;
        if(!TestTrue(TEXT("Catalog rig has identity and mesh"),Value.IsValid()&&Value->TryGetObject(Entry)&&
            Entry&&Entry->IsValid()&&(*Entry)->TryGetStringField(TEXT("id"),Id)&&
            (*Entry)->TryGetStringField(TEXT("mesh"),MeshPath)))continue;
        const USkeletalMesh* Mesh=LoadObject<USkeletalMesh>(nullptr,*MeshPath);
        if(!TestNotNull(*Id,Mesh))continue;
        FFlowArtsSkinnedClearanceData Data;FString Error;
        if(!TestTrue(*FString::Printf(TEXT("%s weighted cache: %s"),*Id,*Error),
            FFlowArtsSkinnedClearance::Build(Mesh,Data,Error)))continue;
        AddInfo(FString::Printf(TEXT("%s body faces=%d caps=%d components=%d covered=%d; armPair=%d"),
            *Id,Data.BodyTriangles.Num(),Data.BodyCapTriangles.Num(),Data.BodyComponentCount,
            Data.bTorsoCoveredByClosedBody,Data.bCanCertifyArmPair));
        TestEqual(*FString::Printf(TEXT("%s held-prop body capability requires complete closed coverage"),*Id),
            Data.bCanCertifyHeldPropBody,Data.bTorsoCoveredByClosedBody && Data.BodyComponentCount>0);
        bool bBoundaryReferencesComplete=true;
        for (const FIntVector& T : Data.BodyPropBoundaryTriangles) for (int32 K=0;K<3;++K)
        {
            const int32 V=T[K];
            bBoundaryReferencesComplete &= Data.UpperReferencedVertices.Contains(V) && Data.ReferencedVertices.Contains(V);
            const auto& Vertex=Data.Vertices[V];
            for (int32 I=Vertex.FirstInfluence;I<Vertex.FirstInfluence+Vertex.InfluenceCount;++I)
                bBoundaryReferencesComplete &= Data.UpperReferencedBones.Contains(Data.Influences[I].Bone) &&
                    Data.ReferencedBones.Contains(Data.Influences[I].Bone);
        }
        TestTrue(*FString::Printf(TEXT("%s mixed trunk faces retain every weighted vertex/bone"),*Id),bBoundaryReferencesComplete);
        if (Data.ClosedBodyTopology.Nodes.IsEmpty() || Data.BodyComponentCount == 0)
        {
            // A rig can retain original torso triangles even when its source
            // surface cannot be proved closed. No closed-body bit is granted.
            TestFalse(*FString::Printf(TEXT("%s has no unsupported closed-body waiver"),*Id),
                Data.bTorsoCoveredByClosedBody);
            TestTrue(*FString::Printf(TEXT("%s keeps original torso geometry for conservative fallback"),*Id),
                !Data.TorsoTriangles.IsEmpty()&&!Data.TorsoTopology.Nodes.IsEmpty());
            TArray<FTransform> BindComponents=Mesh->GetRefSkeleton().GetRefBonePose();
            for(int32 Bone=0;Bone<BindComponents.Num();++Bone)
            {
                const int32 Parent=Mesh->GetRefSkeleton().GetParentIndex(Bone);
                if(Parent!=INDEX_NONE)BindComponents[Bone]=BindComponents[Bone]*BindComponents[Parent];
            }
            TestEqual(*FString::Printf(TEXT("%s bind pose cannot acquire an unsupported upper-body waiver"),*Id),
                uint8(FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,BindComponents,.3f,3,false)&3),uint8(0));
            continue;
        }
        TestTrue(*FString::Printf(TEXT("%s closed body retains components"),*Id),
            Data.BodyComponentCount>0);
        TestEqual(*FString::Printf(TEXT("%s held-prop waiver follows torso coverage"),*Id),
            Data.bCanCertifyHeldPropBody,Data.bTorsoCoveredByClosedBody);
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsSkinnedCandidateParityTest,
    "FlowArts.Runtime.ArmClearance.SkinnedCandidateParity",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsSkinnedCandidateParityTest::RunTest(const FString& Parameters)
{
    FString Directory;
    if (!FParse::Value(FCommandLine::Get(), TEXT("FlowArtsClearanceCandidateDir="), Directory))
    {
        AddInfo(TEXT("SkinnedCandidateParity skipped; pass -FlowArtsClearanceCandidateDir=<fixture directory>"));
        return true;
    }
    if (!IFileManager::Get().DirectoryExists(*Directory))
    {
        AddError(*FString::Printf(TEXT("Candidate fixture directory does not exist: %s"), *Directory));
        return false;
    }
    const USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr,
        TEXT("/Game/FlowFest/Characters/x_bot/SK_x_bot.SK_x_bot"));
    if (!TestNotNull(TEXT("Prepared x_bot skeletal mesh"), Mesh)) return false;
    FFlowArtsSkinnedClearanceData Data;
    FString Error;
    const bool bBuilt = FFlowArtsSkinnedClearance::Build(Mesh, Data, Error);
    if (!TestTrue(*FString::Printf(TEXT("x_bot CPU weighted clearance cache: %s"), *Error), bBuilt)) return false;
    if (!TestTrue(TEXT("x_bot supports complete arm-pair certification"), Data.bCanCertifyArmPair)) return false;
    if (!TestTrue(TEXT("x_bot torso faces are proved present in the closed body"),
        Data.bTorsoCoveredByClosedBody)) return false;
    FFlowArtsSkinnedClearanceData LegacyData = Data;
    LegacyData.bTorsoCoveredByClosedBody = false;
    const FReferenceSkeleton& Reference = Mesh->GetRefSkeleton();
    if (!TestEqual(TEXT("Cache and mesh use the same reference skeleton"),
        Data.ReferenceBoneCount, Reference.GetNum())) return false;

    struct FFixture { const TCHAR* Name; const TCHAR* Description; };
    const FFixture Fixtures[] = {
        {TEXT("padded-near-feasible-candidate.json"), TEXT("prior skin-only candidate")},
        {TEXT("cycle017-wide-yaw-headclear-candidate.json"), TEXT("prior skin-only candidate")},
        {TEXT("cycle017-propbody-neighbor-candidate.json"), TEXT("corrected prop/body candidate")}
    };
    for (const FFixture& Fixture : Fixtures)
    {
        const TCHAR* FixtureName = Fixture.Name;
        const FString Path = FPaths::Combine(Directory, FixtureName);
        FString Json;
        TSharedPtr<FJsonObject> Root;
        const TSharedPtr<FJsonObject>* Bones = nullptr;
        if (!FFileHelper::LoadFileToString(Json, *Path) ||
            !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Root) ||
            !Root.IsValid() || !Root->TryGetObjectField(TEXT("bonesComponent"), Bones) || !Bones || !Bones->IsValid())
        {
            AddError(*FString::Printf(TEXT("Cannot read candidate component transforms: %s"), *Path));
            continue;
        }
        TArray<FTransform> Transforms;
        Transforms.SetNum(Data.ReferenceBoneCount);
        bool bComplete = Data.ReferenceBoneNames.Num() == Data.ReferenceBoneCount;
        // Supply the complete skeleton array. Unreferenced bones retain their
        // absolute bind transform; every bone used by this certificate must come
        // from the captured candidate, so missing data cannot produce a false pass.
        for (int32 Index = 0; bComplete && Index < Data.ReferenceBoneCount; ++Index)
        {
            Transforms[Index] = Reference.GetRefBonePose()[Index];
            const int32 Parent = Reference.GetParentIndex(Index);
            if (Parent != INDEX_NONE) Transforms[Index] = Transforms[Index] * Transforms[Parent];
            const FString BoneName = Data.ReferenceBoneNames[Index].ToString();
            const TArray<TSharedPtr<FJsonValue>>* Components = nullptr;
            if (!(*Bones)->TryGetArrayField(BoneName, Components))
            {
                if (Data.ReferencedBones.Contains(Index))
                {
                    AddError(*FString::Printf(TEXT("%s lacks required certificate bone %s"), FixtureName, *BoneName));
                    bComplete = false;
                }
                continue;
            }
            if (!Components || Components->Num() != 10)
            {
                AddError(*FString::Printf(TEXT("%s missing ten component values for %s"), FixtureName, *BoneName));
                bComplete = false;
                break;
            }
            double V[10];
            for (int32 Component = 0; Component < 10; ++Component)
            {
                if (!(*Components)[Component].IsValid() ||
                    !(*Components)[Component]->TryGetNumber(V[Component]) || !FMath::IsFinite(V[Component]))
                {
                    AddError(*FString::Printf(TEXT("%s has invalid %s component %d"),
                        FixtureName, *BoneName, Component));
                    bComplete = false;
                    break;
                }
            }
            if (!bComplete) break;
            const FQuat Rotation(V[3], V[4], V[5], V[6]);
            if (!FMath::IsNearlyEqual(Rotation.SizeSquared(), 1., .001) ||
                V[7] <= 0. || V[8] <= 0. || V[9] <= 0.)
            {
                AddError(*FString::Printf(TEXT("%s has invalid rotation or scale for %s"), FixtureName, *BoneName));
                bComplete = false;
                break;
            }
            Transforms[Index] = FTransform(Rotation, FVector(V[0], V[1], V[2]), FVector(V[7], V[8], V[9]));
        }
        if (!bComplete)
        {
            if (Data.ReferenceBoneNames.Num() != Data.ReferenceBoneCount)
                AddError(TEXT("Weighted cache has incomplete reference bone names"));
            continue;
        }
        for (const float Padding : { .3f, 1.f, 5.f, 20.f })
        {
            TArray<FFlowArtsContactWitness> FastWitnesses, LegacyWitnesses;
            const uint8 Mask = FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(
                Data, Transforms, Padding, 3, true, &FastWitnesses);
            const uint8 LegacyMask = FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(
                LegacyData, Transforms, Padding, 3, true, &LegacyWitnesses);
            TestEqual(*FString::Printf(TEXT("%s padding %.1f optimized/legacy exact mask"),
                FixtureName, Padding), int32(Mask), int32(LegacyMask));
            if (Padding == .3f)
                TestEqual(*FString::Printf(TEXT("%s (%s) native padded left/right/pair certificate"),
                    FixtureName, Fixture.Description), int32(Mask), 7);
            if (!FastWitnesses.IsEmpty())
                TestTrue(*FString::Printf(TEXT("%s padding %.1f fast witnesses evaluate"), FixtureName, Padding),
                    FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data, Transforms, FastWitnesses, Padding) <
                    TNumericLimits<double>::Max());
        }
    }
    return !HasAnyErrors();
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsSkinnedBoundsRefitTest,
    "FlowArts.Runtime.ArmClearance.SkinnedBoundsRefit",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsSkinnedBoundsRefitTest::RunTest(const FString& Parameters)
{
    const FVector CrossA[3] = {FVector(-2,-2,0),FVector(2,-2,0),FVector(0,2,0)};
    const FVector CrossB[3] = {FVector(0,-1,-1),FVector(0,1,-1),FVector(0,0,1)};
    const FVector EscapingB[3] = {CrossB[0]+FVector(0,0,.5),CrossB[1]+FVector(0,0,.5),CrossB[2]+FVector(0,0,.5)};
    TestEqual(TEXT("Both crossing poses have zero surface distance"),TriangleDistanceSq(CrossA,CrossB),0.);
    TestEqual(TEXT("Partly escaped crossing still has zero surface distance"),TriangleDistanceSq(CrossA,EscapingB),0.);
    TestTrue(TEXT("Crossing ranking distinguishes an escape before surface separation"),
        TriangleCrossingExitDepth(CrossA,CrossB) > TriangleCrossingExitDepth(CrossA,EscapingB));
    const TArray<FVector> Bind = {
        FVector(-1,-1,-1), FVector(1,-1,-1), FVector(1,1,-1), FVector(-1,1,-1),
        FVector(-1,-1,1), FVector(1,-1,1), FVector(1,1,1), FVector(-1,1,1)};
    const TArray<FIntVector> Triangles = {
        FIntVector(0,2,1), FIntVector(0,3,2), FIntVector(4,5,6), FIntVector(4,6,7),
        FIntVector(0,1,5), FIntVector(0,5,4), FIntVector(1,2,6), FIntVector(1,6,5),
        FIntVector(2,3,7), FIntVector(2,7,6), FIntVector(3,0,4), FIntVector(3,4,7)};
    FSurfaceTree BindTree(Bind, Triangles);
    const TArray<FVector> DistantPoints = {FVector(20,0,0),FVector(20,1,0),FVector(20,0,1)};
    const TArray<FIntVector> DistantTriangles = {FIntVector(0,1,2)};
    const FSurfaceTree TorsoOnly(DistantPoints,DistantTriangles);
    const FPolygon Crossing = {FVector(0,0,0),FVector(3,.2,0),FVector(3,0,.2)};
    const FVector Centroid = (Crossing[0]+Crossing[1]+Crossing[2])/3.;
    TestTrue(TEXT("Crossing shoulder triangle has an outside centroid"),BindTree.Outside(Centroid));
    TestFalse(TEXT("Complete shoulder surface rejects crossing missed by torso-only distance and centroid"),
        TorsoOnly.Clear(Crossing,.3,BindTree));
    const FPolygon Separated = {FVector(3,0,0),FVector(3,.2,0),FVector(3,0,.2)};
    TestTrue(TEXT("Complete shoulder check still accepts separated triangles"),TorsoOnly.Clear(Separated,.3,BindTree));
    FFlowArtsSkinnedClearanceData::FSurfaceTopology Topology;
    Topology.Nodes = MoveTemp(BindTree.Nodes);
    Topology.Order = MoveTemp(BindTree.Order);
    for (int32 Pose = 0; Pose < 4; ++Pose)
    {
        // Large translation, shear and anisotropic deformation move surfaces beyond bind bounds.
        const auto Deform = [Pose](const FVector& P) {
            return FVector(P.X * (1. + Pose) + P.Z * .7 * Pose + Pose * 20.,
                P.Y * (1. + .2 * Pose) - Pose * 7., P.Z * (1. + .3 * Pose));
        };
        TArray<FVector> Points;
        for (const FVector& P : Bind) Points.Add(Deform(P));
        const FSurfaceTree Rebuilt(Points, Triangles), Refit(Points, Triangles, Topology);
        TestFalse(TEXT("Refitted closed surface retains inside containment"), Refit.Outside(Deform(FVector::ZeroVector)));
        TestTrue(TEXT("Refitted closed surface retains distant outside"), Refit.Outside(Deform(FVector(5,4,3))));
        TestFalse(TEXT("Near-boundary interior still runs containment"), Refit.Outside(Deform(FVector(.999,.17,.2))));
        TestTrue(TEXT("Near-boundary exterior remains outside"), Refit.Outside(Deform(FVector(1.001,.17,.2))));
        const FVector NearCenter = Deform(FVector(1.001,.17,.2));
        const FPolygon NearPolygon = {NearCenter, NearCenter + FVector(0,.02,0), NearCenter + FVector(0,0,.02)};
        TestFalse(TEXT("Outside bounds cannot bypass surface padding"), Refit.Clear(NearPolygon,.3,Refit));
        for (const FVector& P : {FVector(0,0,0), FVector(.9,.17,.2), FVector(1.2,.17,.2), FVector(5,4,3)})
        {
            const FVector Center = Deform(P);
            TestEqual(TEXT("Refit and rebuilt containment agree"), Refit.Outside(Center), Rebuilt.Outside(Center));
            const FVector Probe[3] = {Center, Center + FVector(.1,0,.03), Center + FVector(0,.1,-.02)};
            FBox Box(ForceInit); for (const FVector& V : Probe) Box += V;
            TestEqual(TEXT("Refit and rebuilt padded surface distance agree"),
                Refit.Near(0, Probe, Box.ExpandBy(.3), .09), Rebuilt.Near(0, Probe, Box.ExpandBy(.3), .09));
        }
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsSkinnedHeldPropBodyTest,
    "FlowArts.Runtime.ArmClearance.SkinnedHeldPropBody",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsSkinnedHeldPropBodyTest::RunTest(const FString& Parameters)
{
    const TArray<FVector> Cube={FVector(-1,-1,-1),FVector(1,-1,-1),FVector(1,1,-1),FVector(-1,1,-1),
        FVector(-1,-1,1),FVector(1,-1,1),FVector(1,1,1),FVector(-1,1,1)};
    const TArray<FIntVector> Faces={FIntVector(0,2,1),FIntVector(0,3,2),FIntVector(4,5,6),FIntVector(4,6,7),
        FIntVector(0,1,5),FIntVector(0,5,4),FIntVector(1,2,6),FIntVector(1,6,5),
        FIntVector(2,3,7),FIntVector(2,7,6),FIntVector(3,0,4),FIntVector(3,4,7)};
    // Two coincident posed lobes model parity cancellation in a folded component.
    // The point is enclosed twice; no ray to infinity is unobstructed.
    TArray<FIntVector> FoldedFaces=Faces;
    FoldedFaces.Append(Faces);
    FSurfaceTree FoldedTree(Cube,FoldedFaces);
    TestTrue(TEXT("Double-covered enclosure demonstrates even-parity ambiguity"),
        FoldedTree.Outside(FVector(.13,.21,.17)));
    FoldedTree.bRequireEscapeRay=true;
    TestFalse(TEXT("Escape-ray containment rejects overlapping posed lobes"),
        FoldedTree.Outside(FVector(.13,.21,.17)));
    TestTrue(TEXT("Escape-ray containment retains posed-bound exclusion"),
        FoldedTree.Outside(FVector(3,.21,.17)));
    FFlowArtsSkinnedClearanceData Data; Data.ReferenceBoneCount=2;
    Data.bTorsoCoveredByClosedBody=true; Data.bCanCertifyHeldPropBody=true;
    Data.ClosedBodyTriangles=Faces; Data.ClosedBodyComponents.Init(0,Faces.Num()); Data.BodyComponentCount=1;
    TArray<FVector> Points=Cube;
    for (int32 V=0;V<Cube.Num();++V)
    {
        Data.Vertices.Add({V,1}); Data.Influences.Add({0,Cube[V],1.f});
        Data.UpperReferencedVertices.Add(V);
    }
    Data.UpperReferencedBones={0};
    {
        FSurfaceTree Tree(Points,Faces);
        Data.ClosedBodyTopology.Nodes=MoveTemp(Tree.Nodes); Data.ClosedBodyTopology.Order=MoveTemp(Tree.Order);
    }
    TArray<FTransform> Pose={FTransform::Identity,FTransform::Identity};
    TArray<FFlowArtsClearanceCapsule> Left={{FVector(-2,3,0),FVector(2,3,0),.5f}};
    TArray<FFlowArtsClearanceCapsule> Right=Left;
    const auto Mask=[&](uint8 Requested=3)
    {
        return FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.25f,0,false,nullptr,
            Left,Right,0,Requested);
    };
    TestEqual(TEXT("Closed body independently certifies both owner props"),Mask(),uint8(96));
    TestEqual(TEXT("Unrequested body certificate grants no bits"),Mask(0),uint8(0));
    Left[0]={FVector(-2,0,0),FVector(2,0,0),.1f};
    TestEqual(TEXT("Actual shaft crossing rejects only its owner"),Mask(),uint8(64));
    TArray<FFlowArtsPropContactWitness> Contacts;
    TestEqual(TEXT("Failed body certificate exposes the exact triangle and capsule"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.25f,0,false,nullptr,
            Left,Right,0,3,&Contacts),uint8(64));
    if (!TestTrue(TEXT("Body surface contact has an owner and a valid triangle"),
        Contacts.Num()==1 && Contacts[0].SurfaceKind==1 && Contacts[0].PropSide==0 &&
        Faces.IsValidIndex(Contacts[0].TriangleIndex) && Contacts[0].CapsuleIndex==0)) return false;
    const double CrossingObjective=FFlowArtsSkinnedClearance::EvaluatePropContactWitnesses(
        Data,Pose,Contacts,Left,Right,.25f);
    Pose[0].SetTranslation(FVector(0,3,0));
    const double SeparatedObjective=FFlowArtsSkinnedClearance::EvaluatePropContactWitnesses(
        Data,Pose,Contacts,Left,Right,.25f);
    TestTrue(TEXT("Exact prop contact objective descends as the weighted surface separates"),
        FMath::IsFinite(CrossingObjective) && CrossingObjective>SeparatedObjective);
    Pose[0]=FTransform::Identity;
    Left[0]={FVector::ZeroVector,FVector::ZeroVector,.1f};
    TestEqual(TEXT("Wholly contained prop rejects despite separated surface"),Mask(),uint8(64));
    Contacts.Reset();
    FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.25f,0,false,nullptr,
        Left,Right,0,3,&Contacts);
    TestTrue(TEXT("Contained prop exposes a signed exit face for search"),
        Contacts.Num()==1 && Contacts[0].bContainment &&
        FFlowArtsSkinnedClearance::EvaluatePropContactWitnesses(Data,Pose,Contacts,Left,Right,.25f)>0.);
    Left[0].RadiusCm=3.f;
    TestEqual(TEXT("Body wholly enclosed by prop rejects"),Mask(),uint8(64));
    Left[0]={FVector(-2,1.75,0),FVector(2,1.75,0),.5f};
    TestEqual(TEXT("Exact padded tangency rejects"),Mask(),uint8(64));
    Left[0].Start.Y=Left[0].End.Y=1.751;
    TestEqual(TEXT("Strictly beyond padding clears"),Mask(),uint8(96));
    FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.25f,0,false,nullptr,
        Left,Right,0,3,&Contacts);
    TestTrue(TEXT("Clear prop query does not retain a stale contact"),Contacts.IsEmpty());
    Pose[0].SetTranslation(FVector(0,1,0));
    TestEqual(TEXT("Fresh deformed body invalidates previous certificate"),Mask(),uint8(64));
    Pose[0]=FTransform::Identity;
    Left.Reset();
    TestEqual(TEXT("Missing owner props never grant a bit"),Mask(),uint8(64));
    Left=Right; Left[0].RadiusCm=-1.f;
    TestEqual(TEXT("Invalid capsule never grants a bit"),Mask(),uint8(64));
    Left=Right; Data.bCanCertifyHeldPropBody=false;
    TestEqual(TEXT("Incomplete body coverage retains conservative guard"),Mask(),uint8(0));
    Data.bCanCertifyHeldPropBody=true;
    // A mixed torso/arm source face outside the closed trunk must still protect its surface.
    const FVector Extra[3]={FVector(-1,3,-1),FVector(1,3,-1),FVector(0,3,1)};
    for (const FVector& P : Extra)
    {
        const int32 V=Points.Add(P); Data.Vertices.Add({V,1}); Data.Influences.Add({1,P,1.f});
        Data.UpperReferencedVertices.Add(V);
    }
    Data.UpperReferencedBones.Add(1);
    Data.BodyPropBoundaryTriangles={FIntVector(8,9,10)};
    {
        FSurfaceTree Tree(Points,Data.BodyPropBoundaryTriangles);
        Data.BodyPropBoundaryTopology.Nodes=MoveTemp(Tree.Nodes); Data.BodyPropBoundaryTopology.Order=MoveTemp(Tree.Order);
    }
    TestEqual(TEXT("Mixed trunk boundary face cannot be omitted"),Mask(),uint8(0));
    Pose[1].SetTranslation(FVector(0,3,0));
    TestEqual(TEXT("Mixed face uses its own current bone influences"),Mask(),uint8(96));
    Pose.SetNum(1);
    TestEqual(TEXT("Missing mixed-face bone rejects instead of certifying"),Mask(),uint8(0));
    Pose={FTransform::Identity,FTransform::Identity};
    Data.BodyPropBoundaryTriangles.Reset(); Data.BodyPropBoundaryTopology={};
    FFlowArtsSkinnedClearanceData::FLowerBodyRegion Lower; Lower.Bone=1;
    for (const FVector& P : Cube)
    {
        const int32 V=Data.Vertices.Num(); Lower.Vertices.Add(V);
        Data.Vertices.Add({Data.Influences.Num(),1});
        Data.Influences.Add({1,P+FVector(0,10,0),1.f}); Data.UpperReferencedVertices.Add(V);
    }
    Data.LowerBodyRegions.Add(MoveTemp(Lower));
    Left={{FVector(0,10,0),FVector(0,10,.1),.1f}};
    TestEqual(TEXT("Prop wholly inside disconnected open leg cover rejects"),Mask(),uint8(64));
    FFlowArtsArmClearanceInput SolveInput;
    SolveInput.bSourceFidelityOnly=true;
    for (int32 Side=0; Side<2; ++Side)
    {
        const double X=Side ? 100. : -100.;
        auto& Arm=SolveInput.Arms[Side];
        Arm.Upper.SetLocation(FVector(X,0,30));
        Arm.Elbow.SetLocation(FVector(X,10,20));
        Arm.Wrist.SetLocation(FVector(X,0,10));
    }
    SolveInput.HeldPropCapsules[0]=Left;
    SolveInput.CertifySkinnedHeldPropBody=[&](const FFlowArtsClearanceArm*,const FQuat&,
        const TArray<FFlowArtsClearanceCapsule>& L,const TArray<FFlowArtsClearanceCapsule>& R,uint8 Requested)
    { return FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.25f,0,false,nullptr,L,R,0,Requested)&uint8(96); };
    FFlowArtsArmClearanceHistory SolveHistory;
    const auto LowerBlocked=FFlowArtsArmClearance::Solve(SolveInput,SolveHistory);
    TestTrue(TEXT("Lower-body regression has no broad proxy penetration"),LowerBlocked.WorstPenetrationCm<=.02f);
    TestFalse(TEXT("Exact lower-body contact blocks solver despite clear broad proxies"),LowerBlocked.bFeasible);
    TestEqual(TEXT("Rejected exact lower-body bit remains absent"),LowerBlocked.SkinnedHeldPropBodyClearMask,uint8(0));
    Pose[1].SetTranslation(FVector(0,10,0)); SolveHistory.Reset();
    const auto LowerClear=FFlowArtsArmClearance::Solve(SolveInput,SolveHistory);
    TestTrue(TEXT("Moving the actual lower body clear admits the same proxy-clear solve"),LowerClear.bFeasible);
    TestEqual(TEXT("Accepted solve retains exact held-body certificate"),LowerClear.SkinnedHeldPropBodyClearMask,uint8(32));
    Pose[1]=FTransform::Identity;
    Pose[1].SetTranslation(FVector(0,10,0));
    TestEqual(TEXT("Lower-body cover follows actual leg pose"),Mask(),uint8(96));
    Pose[1]=FTransform::Identity;
    Left[0]={FVector(0,11.35,0),FVector(0,11.35,.1),.1f};
    TestEqual(TEXT("Lower-body padded tangency rejects"),Mask(),uint8(64));
    Left[0].Start.Y=Left[0].End.Y=11.351;
    TestEqual(TEXT("Separated lower-body capsule still certifies"),Mask(),uint8(96));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsUncappedArmCoverageTest,
    "FlowArts.Runtime.ArmClearance.UncappedArmCoverage",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsUncappedArmCoverageTest::RunTest(const FString& Parameters)
{
    FFlowArtsSkinnedClearanceData Data;
    Data.ReferenceBoneCount = 2;
    const auto AddPoint = [&](int32 Bone, const FVector& Point, bool bDistal)
    {
        const int32 Index = Data.Vertices.Add({Data.Influences.Num(), 1});
        Data.Influences.Add({Bone, Point, 1.f});
        Data.UncappedArmVertices[Bone].Add(Index);
        if (bDistal) Data.DistalArmVertices[Bone].Add(Index);
    };
    // A shared proximal face does not by itself imply distal skin contact.
    // The solver still retains its forearm capsule for any upper-only face.
    for (const FVector& Point : {FVector(10, 0, 0), FVector(10, 1, 0), FVector(10, 0, 1)})
        AddPoint(0, Point, true);
    for (const FVector& Point : {FVector(.1, 0, 0), FVector(.1, 1, 0), FVector(.1, 0, 1)})
        AddPoint(0, Point, false);
    for (const FVector& Point : {FVector(0, 0, 0), FVector(0, 1, 0), FVector(0, 0, 1)})
        AddPoint(1, Point, true);
    Data.UncappedArmBone[0] = 0; Data.UncappedArmBone[1] = 1;
    Data.DistalArmBone[0] = 0; Data.DistalArmBone[1] = 1;
    const TArray<FTransform> Pose = {FTransform::Identity, FTransform::Identity};
    const TArray<FFlowArtsClearanceCapsule> RightProps =
        {{FVector::ZeroVector, FVector::ZeroVector, .1f}};
    TestEqual(TEXT("Shared proximal face does not block separated distal skin"),
        FFlowArtsSkinnedClearance::CertifyUncappedSegments(Data, Pose, .3f, {}, RightProps, 17), uint8(17));
    for (int32 Index = 0; Index < 3; ++Index)
        Data.Influences[Index].BoneLocalPosition.X = .1;
    TestEqual(TEXT("Actual distal pair and opposite prop contact remains rejected"),
        FFlowArtsSkinnedClearance::CertifyUncappedSegments(Data, Pose, .3f, {}, RightProps, 17), uint8(0));
    for (int32 Index = 0; Index < 3; ++Index)
        Data.Influences[Index].BoneLocalPosition.X = 10.;
    for (const FVector& Point : {FVector(10, 0, 0), FVector(10, 1, 0), FVector(10, 0, 1)})
        AddPoint(1, Point, false);
    TestEqual(TEXT("Distal skin remains guarded against opposite proximal arm"),
        FFlowArtsSkinnedClearance::CertifyUncappedSegments(Data, Pose, .3f, {}, RightProps, 17), uint8(16));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsHandPropDepthEscapeTest,
    "FlowArts.Runtime.ArmClearance.HandPropDepthEscape",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FFlowArtsHandPropDepthEscapeTest::RunTest(const FString&)
{
    FFlowArtsSkinnedClearanceData Data;
    TArray<FVector> Points;
    // Two palm faces form a narrow interval. An unsigned local distance step
    // toward the farther exit first approaches/crosses the nearer face.
    for(int32 Side=0;Side<2;++Side)
    {
        for(double Y:{-1.,1.})
        {
            FIntVector Face;
            int32 K=0;
            for(const FVector P:{FVector(-2,Y,-2),FVector(2,Y,-2),FVector(0,Y,2)})
            {
                const FVector Q=P+FVector(Side*100.,0,0);
                const int32 V=Points.Add(Q); Face[K++]=V;
                Data.Vertices.Add({Data.Influences.Num(),1}); Data.Influences.Add({0,Q,1.f});
            }
            Data.HandTriangles[Side].Add(Face);
        }
        FSurfaceTree Tree(Points,Data.HandTriangles[Side]);
        Data.HandTopology[Side].Nodes=MoveTemp(Tree.Nodes);
        Data.HandTopology[Side].Order=MoveTemp(Tree.Order);
    }
    TArray<FTransform> Frames={FTransform::Identity};
    FFlowArtsClearanceCapsule Prop; Prop.Start=FVector(0,.9,-.2); Prop.End=FVector(0,.9,.2); Prop.RadiusCm=.3f;
    TArray<FFlowArtsClearanceCapsule> Right={Prop};
    double Depth=0.;
    TestFalse(TEXT("Bounded interval without clear endpoint returns no proposal"),
        FFlowArtsSkinnedClearance::FindHandPropDepthEscape(Data,Frames,{},Right,FVector::RightVector,.1,Depth));
    TestTrue(TEXT("Signed search crosses local contact basin to a clear endpoint"),
        FFlowArtsSkinnedClearance::FindHandPropDepthEscape(Data,Frames,{},Right,FVector::RightVector,2.,Depth));
    TestTrue(TEXT("Relative two-hand displacement finds the far face exit"),Depth>1.25 && Depth<1.251);
    TestFalse(TEXT("Invalid normal cannot propose path distortion"),
        FFlowArtsSkinnedClearance::FindHandPropDepthEscape(Data,Frames,{},Right,FVector::ZeroVector,2.,Depth));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsSkinnedArmPairTest,
    "FlowArts.Runtime.ArmClearance.SkinnedArmPair",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsSkinnedArmPairTest::RunTest(const FString& Parameters)
{
    const TArray<FVector> Cube={FVector(-1,-1,-1),FVector(1,-1,-1),FVector(1,1,-1),FVector(-1,1,-1),
        FVector(-1,-1,1),FVector(1,-1,1),FVector(1,1,1),FVector(-1,1,1)};
    const TArray<FIntVector> Faces={FIntVector(0,2,1),FIntVector(0,3,2),FIntVector(4,5,6),FIntVector(4,6,7),
        FIntVector(0,1,5),FIntVector(0,5,4),FIntVector(1,2,6),FIntVector(1,6,5),
        FIntVector(2,3,7),FIntVector(2,7,6),FIntVector(3,0,4),FIntVector(3,4,7)};
    FFlowArtsSkinnedClearanceData Data;Data.ReferenceBoneCount=2;Data.bCanCertifyArmPair=true;
    TArray<FVector> Points;TArray<int32> Weld;
    for(int32 Side=0;Side<2;++Side)for(const auto& P:Cube)
    {
        const int32 V=Points.Add(P);Weld.Add(V);Data.Vertices.Add({V,1});
        Data.Influences.Add({Side,P,1.f});Data.ReferencedVertices.Add(V);
    }
    Data.ReferencedBones={0,1};
    Data.UpperReferencedVertices=Data.ReferencedVertices;
    Data.UpperReferencedBones=Data.ReferencedBones;
    for(auto& Band:Data.TorsoSupportVertices)Band={0,1,2,3};
    for(int32 Side=0;Side<2;++Side)
    {
        for(auto T:Faces){for(int32 K=0;K<3;++K)T[K]+=8*Side;Data.FullArmTriangles[Side].Add(T);}
        TestTrue(TEXT("Complete arm topology closes"),CloseArmRegion(Data.FullArmTriangles[Side],Weld,Points,
            Data.FullArmComponents[Side],Data.FullArmWitnessTriangles[Side]));
        Data.FullArmComponentCount[Side]=Data.FullArmWitnessTriangles[Side].Num();
        FSurfaceTree Tree(Points,Data.FullArmTriangles[Side]);
        Data.FullArmTopology[Side].Nodes=MoveTemp(Tree.Nodes);Data.FullArmTopology[Side].Order=MoveTemp(Tree.Order);
    }
    // Thin surfaces are separated by .6cm, while a radius-1cm capsule around each
    // lengthwise centerline overlaps. Surface certification must resolve that false positive.
    TArray<FTransform> Pose={FTransform(FQuat::Identity,FVector::ZeroVector,FVector(3,.1,.1)),
        FTransform(FQuat::Identity,FVector(0,.8,0),FVector(3,.1,.1))};
    TestTrue(TEXT("Loose interarm capsules overlap"),.8<2.);
    TestEqual(TEXT("Separated complete skin clears independently of upper SideMask"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0),uint8(4));
    TestEqual(TEXT("Unrequested arm pair cannot return a certificate"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0,false),uint8(0));
    Data.bCanCertifyArmPair=false;
    TestEqual(TEXT("No capability cannot waive arm capsules"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0),uint8(0));
    Data.bCanCertifyArmPair=true;
    Pose[1].SetTranslation(FVector(0,.1,0));
    TestEqual(TEXT("Actual intersecting arm surfaces reject"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0),uint8(0));
    Pose[1].SetTranslation(FVector(0,.4,0));
    FFlowArtsArmPairContactWitness PairContact;
    TArray<FFlowArtsArmPairContactWitness> PairContacts;
    const uint8 PairMask=FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0,true,
        nullptr,{}, {},0,0,nullptr,&PairContact,&PairContacts);
    TestEqual(TEXT("Padded pair contact is not certified"),PairMask,uint8(0));
    TestTrue(TEXT("Exact rejected pair identifies both triangle faces"),
        PairContact.LeftTriangleIndex!=INDEX_NONE && PairContact.RightTriangleIndex!=INDEX_NONE);
    TestTrue(TEXT("Parallel nearby faces retain multiple bounded simultaneous constraints"),
        PairContacts.Num()>1 && PairContacts.Num()<=32);
    for(const auto& Witness:PairContacts)
        TestTrue(TEXT("Collected pair is an actual padded surface contact"),
            FFlowArtsSkinnedClearance::EvaluateArmPairContactWitness(Data,Pose,Witness,.35f)>0.);
    for (int32 Side=0; Side<2; ++Side)
    {
        const int32 Face=Side==0 ? 8 : 4;
        Data.HandTriangles[Side]={Data.FullArmTriangles[Side][Face]};
        Data.HandFullArmTriangleIndices[Side]={Face};
        FSurfaceTree HandTree(Points,Data.HandTriangles[Side]);
        Data.HandTopology[Side].Nodes=MoveTemp(HandTree.Nodes);
        Data.HandTopology[Side].Order=MoveTemp(HandTree.Order);
    }
    TestEqual(TEXT("Open hand subset cannot waive full pair rejection"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0,true,
            nullptr,{}, {},0,0,nullptr,&PairContact),uint8(0));
    TestEqual(TEXT("Hand contact keeps full-arm left triangle identity"),PairContact.LeftTriangleIndex,8);
    TestEqual(TEXT("Hand contact keeps full-arm right triangle identity"),PairContact.RightTriangleIndex,4);
    const double PairNear=FFlowArtsSkinnedClearance::EvaluateArmPairContactWitness(Data,Pose,PairContact,.3f);
    TestTrue(TEXT("Padded pair witness has a descent objective"),PairNear>0.);
    Pose[1].SetTranslation(FVector(0,.8,0));
    TestEqual(TEXT("Fresh separated pair certifies with manifold requested"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0,true,
            nullptr,{}, {},0,0,nullptr,nullptr,&PairContacts),uint8(4));
    TestTrue(TEXT("Fresh separated query clears old simultaneous witnesses"),PairContacts.IsEmpty());
    TestEqual(TEXT("Moving apart clears the same exact pair objective"),
        FFlowArtsSkinnedClearance::EvaluateArmPairContactWitness(Data,Pose,PairContact,.3f),0.);
    Pose[1].SetTranslation(FVector(0,.4,0));
    TestEqual(TEXT("Separated surfaces within padding reject"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0),uint8(0));
    Pose[0]=FTransform(FQuat::Identity,FVector::ZeroVector,FVector(3));
    Pose[1]=FTransform(FQuat::Identity,FVector::ZeroVector,FVector(.5));
    for (int32 Side = 0; Side < 2; ++Side)
    {
        auto& Region = Side == 0 ? Data.ClosedInfluenceDistal[0] : Data.ClosedInfluenceArm[1];
        Region.Triangles = Data.FullArmTriangles[Side];
        Region.Components = Data.FullArmComponents[Side];
        Region.Witnesses = Data.FullArmWitnessTriangles[Side];
        Region.Topology = Data.FullArmTopology[Side];
    }
    // No projection indices: exercise the complete closed-region fallback directly.
    TestEqual(TEXT("Influence-region containment rejects without a crossing"),
        FFlowArtsSkinnedClearance::CertifyUncappedSegments(Data,Pose,.3f,{}, {},1),uint8(0));
    Pose[1].SetTranslation(FVector(8, .13, .21));
    TestEqual(TEXT("Validated influence-region surfaces can prove separation"),
        FFlowArtsSkinnedClearance::CertifyUncappedSegments(Data,Pose,.3f,{}, {},1),uint8(1));
    const TArray<FFlowArtsClearanceCapsule> InfluenceProps =
        {{FVector(8,.13,.21),FVector(8,.13,1.21),.1f}};
    TestEqual(TEXT("Validated distal closure proves opposite prop separation"),
        FFlowArtsSkinnedClearance::CertifyUncappedSegments(Data,Pose,.3f,{},InfluenceProps,16),uint8(16));
    Data.ClosedInfluenceDistal[0] = {};
    TestEqual(TEXT("Absent closure cannot waive an inconclusive projection"),
        FFlowArtsSkinnedClearance::CertifyUncappedSegments(Data,Pose,.3f,{},InfluenceProps,17),uint8(0));
    Pose[1].SetTranslation(FVector::ZeroVector);
    TestEqual(TEXT("Right fully contained without crossings rejects"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0),uint8(0));
    Swap(Pose[0],Pose[1]);
    TestEqual(TEXT("Left fully contained without crossings rejects"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0),uint8(0));
    TArray<FIntVector> Open=Faces;Open.RemoveAt(2,2);TArray<int32> Components,Witnesses;
    TestTrue(TEXT("Simple cut is completely capped"),CloseArmRegion(Open,Weld,Points,Components,Witnesses));
    TestEqual(TEXT("Cut closure restores all cube faces"),Open.Num(),12);
    TArray<FIntVector> Invalid=Faces;Invalid.Add(Faces[0]);Components.Reset();Witnesses.Reset();
    TestFalse(TEXT("Nonmanifold region cannot enable certification"),CloseArmRegion(Invalid,Weld,Points,Components,Witnesses));
    // Complete-arm vs opposite held prop, independent of unavailable closed-body data.
    Pose={FTransform::Identity,FTransform(FVector(10,0,0))};
    TArray<FFlowArtsClearanceCapsule> LeftProps={{FVector(8,3,0),FVector(12,3,0),.5f}};
    TArray<FFlowArtsClearanceCapsule> RightProps={{FVector(-2,3,0),FVector(2,3,0),.5f}};
    const auto PropsMask=[&](uint8 Requested=3)
    {
        return FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0,false,nullptr,
            LeftProps,RightProps,Requested);
    };
    TestEqual(TEXT("Separated opposite props certify both complete arms without body topology"),PropsMask(),uint8(24));
    TestEqual(TEXT("Unrequested opposite props grant no bits"),PropsMask(0),uint8(0));
    TestEqual(TEXT("Requested left arm only grants its own bit"),PropsMask(1),uint8(8));
    for (auto& Band : Data.TorsoSupportVertices) Band.Reset();
    TestEqual(TEXT("Unavailable body support cannot suppress independent complete-arm prop certificate"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,3,false,nullptr,
            LeftProps,RightProps,3),uint8(24));
    RightProps[0]={FVector(-2,0,0),FVector(2,0,0),.1f};
    TestEqual(TEXT("Capsule crossing an arm surface rejects only that arm"),PropsMask(),uint8(16));
    TArray<FFlowArtsPropContactWitness> PropContacts;
    TestEqual(TEXT("Rejected opposite prop reports its actual arm triangle"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0,false,nullptr,
            LeftProps,RightProps,3,0,&PropContacts),uint8(16));
    TestTrue(TEXT("Opposite prop witness identifies arm side, owner, and capsule"),
        PropContacts.Num()>=1 && PropContacts.Num()<=17 && PropContacts[0].SurfaceKind==0 &&
        PropContacts[0].SurfaceSide==0 && PropContacts[0].PropSide==1 &&
        Data.FullArmTriangles[0].IsValidIndex(PropContacts[0].TriangleIndex) &&
        PropContacts[0].CapsuleIndex==0 &&
        FFlowArtsSkinnedClearance::EvaluatePropContactWitnesses(
            Data,Pose,PropContacts,LeftProps,RightProps,.3f)>0.);
    const double ManifoldObjective=FFlowArtsSkinnedClearance::EvaluatePropContactWitnesses(
        Data,Pose,PropContacts,LeftProps,RightProps,.3f);
    const auto DuplicatedContacts=PropContacts;
    PropContacts.Append(DuplicatedContacts);
    TestEqual(TEXT("Duplicated tessellation contacts cannot multiply the correction force"),
        FFlowArtsSkinnedClearance::EvaluatePropContactWitnesses(
            Data,Pose,PropContacts,LeftProps,RightProps,.3f),ManifoldObjective);
    RightProps[0]={FVector(-2,3,0),FVector(2,3,0),.5f};
    FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Pose,.3f,0,false,nullptr,
        LeftProps,RightProps,3,0,&PropContacts);
    TestTrue(TEXT("Cleared opposite prop drops its previous local witness"),PropContacts.IsEmpty());
    RightProps[0]={FVector::ZeroVector,FVector::ZeroVector,.1f};
    TestEqual(TEXT("Small capsule wholly inside closed arm rejects despite surface separation"),PropsMask(),uint8(16));
    RightProps[0].RadiusCm=3.f;
    TestEqual(TEXT("Arm wholly inside capsule rejects"),PropsMask(),uint8(16));
    RightProps[0]={FVector(-2,1.8,0),FVector(2,1.8,0),.5f};
    TestEqual(TEXT("Capsule tangent to padded arm rejects"),PropsMask(),uint8(16));
    RightProps[0]={FVector(-2,1.81,0),FVector(2,1.81,0),.5f};
    TestEqual(TEXT("Capsule just beyond padding clears"),PropsMask(),uint8(24));
    RightProps[0]={FVector(0,3,0),FVector(0,3,0),.5f};
    TestEqual(TEXT("Zero length capsule uses exact sphere distance"),PropsMask(),uint8(24));
    RightProps.Add({FVector::ZeroVector,FVector::ZeroVector,.1f});
    TestEqual(TEXT("Every capsule must clear, not just first"),PropsMask(),uint8(16));
    RightProps.Pop();
    LeftProps[0]={FVector(10,0,0),FVector(10,0,0),.1f};
    TestEqual(TEXT("Owner arrays are asymmetric: left prop tests right arm"),PropsMask(),uint8(8));
    RightProps[0].RadiusCm=-1.f;
    TestEqual(TEXT("Invalid capsule cannot grant certificate"),PropsMask(),uint8(0));
    RightProps.Reset();
    TestEqual(TEXT("Missing opposite array cannot grant certificate"),PropsMask(1),uint8(0));
    RightProps.Add({FVector(-2,0,0),FVector(2,0,0),.1f});
    TestEqual(TEXT("Original candidate prop crosses"),PropsMask(1),uint8(0));
    RightProps[0].Start+=FVector(0,3,0);RightProps[0].End+=FVector(0,3,0);
    TestEqual(TEXT("Exact candidate prop translation is used"),PropsMask(1),uint8(8));
    Pose[0].SetTranslation(FVector(0,3,0));
    TestEqual(TEXT("Changed candidate arm pose invalidates earlier separation"),PropsMask(1),uint8(0));
    Data.bCanCertifyArmPair=false;
    Pose[0]=FTransform::Identity;
    TestEqual(TEXT("Incomplete closed arms retain conservative prop proxies"),PropsMask(1),uint8(0));
    const FVector Collapsed[3]={FVector(-1,0,0),FVector(0,0,0),FVector(1,0,0)};
    TestTrue(TEXT("Degenerate triangle retains segment interior distance"),FMath::IsNearlyEqual(
        SegmentTriangleDistanceSq(FVector(0,2,0),FVector(0,3,0),Collapsed),4.,1.e-12));
    TestEqual(TEXT("Degenerate triangle crossing rejects at zero distance"),
        SegmentTriangleDistanceSq(FVector(0,-1,0),FVector(0,1,0),Collapsed),0.);
    const FVector CrossingTriangle[3]={FVector(0,-2,-2),FVector(0,2,-2),FVector(0,0,2)};
    const double DeepCrossing=SegmentTriangleCrossingExitDepth(
        FVector(-1,0,0),FVector(1,0,0),CrossingTriangle);
    const double ShallowCrossing=SegmentTriangleCrossingExitDepth(
        FVector(-.25,0,0),FVector(1.75,0,0),CrossingTriangle);
    TestTrue(TEXT("Crossing prop search has a descending escape depth before surface separation"),
        SegmentTriangleDistanceSq(FVector(-1,0,0),FVector(1,0,0),CrossingTriangle)==0. &&
        SegmentTriangleDistanceSq(FVector(-.25,0,0),FVector(1.75,0,0),CrossingTriangle)==0. &&
        DeepCrossing>ShallowCrossing && ShallowCrossing>0.);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FFlowArtsSkinnedReferencedVerticesTest,
    "FlowArts.Runtime.ArmClearance.SkinnedReferencedVertices",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FFlowArtsSkinnedReferencedVerticesTest::RunTest(const FString& Parameters)
{
    FFlowArtsSkinnedClearanceData Data;
    Data.ReferenceBoneCount = 2;
    const FVector Positions[] = {FVector(-1,-1,-1), FVector(1,-1,-1), FVector(0,1,-1),
        FVector(0,0,1), FVector(10,0,0), FVector(10,1,0), FVector(10,0,1), FVector(100,100,100)};
    for (int32 V = 0; V < UE_ARRAY_COUNT(Positions); ++V)
    {
        Data.Vertices.Add({V,1});
        Data.Influences.Add({V == 7 ? 1 : 0, Positions[V], 1.f});
        Data.ReferencedVertices.Add(V);
    }
    Data.ReferencedBones = {0,1};
    Data.UpperReferencedVertices=Data.ReferencedVertices;
    Data.UpperReferencedBones=Data.ReferencedBones;
    Data.TorsoTriangles = {FIntVector(0,2,1),FIntVector(0,1,3),FIntVector(1,2,3),FIntVector(2,0,3)};
    Data.ClosedBodyTriangles = Data.TorsoTriangles;
    Data.ClosedBodyComponents = {0,0,0,0};
    Data.BodyComponentCount = 1;
    TArray<FVector> BindPoints;
    for (const FVector& Position : Positions) BindPoints.Add(Position);
    FSurfaceTree BodyTree(BindPoints,Data.TorsoTriangles);
    Data.TorsoTopology.Nodes = BodyTree.Nodes;
    Data.TorsoTopology.Order = BodyTree.Order;
    Data.ClosedBodyTopology = Data.TorsoTopology;
    for (auto& Band : Data.TorsoSupportVertices) Band = {0,1,2,3};
    for (auto& Side : Data.UpperTriangles) Side.Add({FIntVector(4,5,6),FVector(.5,.5,.5)});
    TArray<FTransform> Transforms = {FTransform::Identity,FTransform::Identity};
    const uint8 Full = FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Transforms);
    TestEqual(TEXT("Separated full-vertex reference pose clears both sides"),Full,uint8(3));
    for (int32 V = 4; V <= 6; ++V) Data.Influences[V].Bone = 1;
    Transforms[1] = FTransform(FQuat::Identity,FVector(-9.7,0,0));
    TArray<FFlowArtsContactWitness> Contacts;
    const uint8 ContactMask = FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(
        Data,Transforms,.3f,3,false,&Contacts);
    TestEqual(TEXT("Near upper surfaces fail exact clearance"),ContactMask,uint8(0));
    TestTrue(TEXT("Exact near rejection yields a local contact witness"),Contacts.Num() > 0);
    if (!Contacts.IsEmpty())
    {
        const double NearObjective = FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Transforms,Contacts,.3f);
        TestTrue(TEXT("Near witness has positive padding shortfall"),NearObjective > 0.);
        for (auto& Side : Data.UpperTriangles)
        {
            const auto Triangle = Side[0];
            for (int32 I = 0; I < 3; ++I) Side.Add(Triangle);
        }
        TArray<FFlowArtsContactWitness> MultipleContacts;
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Transforms,.3f,3,false,&MultipleContacts);
        TestTrue(TEXT("Duplicate triangles retain a genuine contact on each side"),
            MultipleContacts.ContainsByPredicate([](const FFlowArtsContactWitness& W) { return W.Side == 0; }) &&
            MultipleContacts.ContainsByPredicate([](const FFlowArtsContactWitness& W) { return W.Side == 1; }));
        const double DuplicateObjective = FFlowArtsSkinnedClearance::EvaluateContactWitnesses(
            Data,Transforms,MultipleContacts,.3f);
        TestTrue(TEXT("Repeated triangles do not multiply the contact penalty"),
            FMath::IsNearlyEqual(DuplicateObjective,NearObjective,1.e-8));
        TestTrue(TEXT("Near-clear scan retains adjacent genuine triangles on both sides"),
            MultipleContacts.FilterByPredicate([](const FFlowArtsContactWitness& W) { return W.Side == 0; }).Num() > 1 &&
            MultipleContacts.FilterByPredicate([](const FFlowArtsContactWitness& W) { return W.Side == 1; }).Num() > 1);
        TestTrue(TEXT("More required padding increases the unresolved contact penalty"),
            FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Transforms,MultipleContacts,.4f) > DuplicateObjective);
        TestTrue(TEXT("Less required padding reduces the unresolved contact penalty"),
            FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Transforms,MultipleContacts,.2f) < DuplicateObjective);
        for (auto& Side : Data.UpperTriangles) Side.SetNum(1);
        TArray<FFlowArtsContactWitness> FullSet;
        for (int32 I = 0; I < 8; ++I) FullSet.Add({0,0,100+I,false});
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Transforms,.3f,3,false,&FullSet);
        TestEqual(TEXT("Current query replaces the entire stale contact set"),FullSet.Num(),2);
        TestFalse(TEXT("No stale body triangle remains in the active set"),
            FullSet.ContainsByPredicate([](const FFlowArtsContactWitness& W) { return W.BodyTriangleIndex >= 100; }));
        TestTrue(TEXT("Current exact contact enters the bounded witness set"),
            FullSet.ContainsByPredicate([&](const FFlowArtsContactWitness& W) {
                return W.Side == Contacts[0].Side && W.UpperTriangleIndex == Contacts[0].UpperTriangleIndex &&
                    W.BodyTriangleIndex == Contacts[0].BodyTriangleIndex && W.bClosedBody == Contacts[0].bClosedBody;
            }));
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Transforms,.3f,3,false,&FullSet);
        TestEqual(TEXT("Repeated exact contacts stay deduplicated"),FullSet.Num(),2);
        Transforms[1] = FTransform(FQuat::Identity,FVector(-6.,0,0));
        const double FarObjective = FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Transforms,Contacts,.3f);
        TestTrue(TEXT("Only referenced witness vertices are reevaluated after a pose change"),FarObjective < NearObjective);
        for (auto& Side : Data.UpperTriangles) Side[0].BindArmFractions = FVector(.1,.1,.1);
        TestEqual(TEXT("Witness objective ignores the clipped shoulder attachment"),
            FFlowArtsSkinnedClearance::EvaluateContactWitnesses(Data,Transforms,Contacts,.3f),0.);
        for (auto& Side : Data.UpperTriangles) Side[0].BindArmFractions = FVector(.5,.5,.5);
    }
    for (int32 V = 4; V <= 6; ++V) Data.Influences[V].Bone = 0;
    Transforms[1] = FTransform::Identity;
    Data.ReferencedVertices.Pop();
    Data.ReferencedBones = {0};
    Data.UpperReferencedVertices=Data.ReferencedVertices;
    Data.UpperReferencedBones=Data.ReferencedBones;
    TestEqual(TEXT("Referenced subset preserves full-vertex result"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Transforms),Full);
    // An unused head/accessory bone cannot alter any queried surface.
    Transforms[1] = FTransform(FQuat::Identity,FVector(-100,200,300),FVector(7,2,3));
    TestEqual(TEXT("Unused bone changes cannot alter clearance"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Transforms),Full);
    // Complete-arm data may reference a bone which no upper/body surface uses.
    // Skipping the pair must not skin or validate that unrelated bone.
    Data.bCanCertifyArmPair=true;
    Data.ReferencedVertices.Add(7);
    Data.ReferencedBones.Add(2); // Deliberately unavailable complete-arm bone.
    TestEqual(TEXT("Upper-only query retains both upper certificates and no pair bit"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Transforms,.3f,3,false),uint8(3));
    TestEqual(TEXT("Requested pair validates its additional bones"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Transforms,.3f,3,true),uint8(0));
    Data.bCanCertifyArmPair=false;
    Data.ReferencedVertices.Pop();Data.ReferencedBones.Pop();
    Transforms[1]=FTransform::Identity;
    Transforms[0] = FTransform(FQuat(FVector::UpVector,.7),FVector(20,-30,4),FVector(2,3,1));
    const uint8 SubsetMoved = FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Transforms);
    Data.ReferencedVertices.Add(7);
    Data.ReferencedBones.Add(1);
    Data.UpperReferencedVertices=Data.ReferencedVertices;
    Data.UpperReferencedBones=Data.ReferencedBones;
    TestEqual(TEXT("Subset and full skinning agree after deformation"),
        FFlowArtsSkinnedClearance::CertifyUpperTorsoClear(Data,Transforms),SubsetMoved);
    return true;
}
#endif
