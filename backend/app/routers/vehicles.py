"""The user's garage."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import NoResultFound
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.models import SessionParticipant, User, Vehicle
from app.schemas import SessionActionResponse, VehicleCreate, VehicleRead

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.post("", response_model=VehicleRead)
def create_vehicle(
    data: VehicleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Vehicle:
    vehicle = Vehicle(user_id=current_user.id, **data.dict())
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.get("", response_model=List[VehicleRead])
def list_vehicles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> List[Vehicle]:
    return db.exec(select(Vehicle).where(Vehicle.user_id == current_user.id)).all()


@router.post("/{vehicle_id}/activate", response_model=VehicleRead)
def activate_vehicle(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Vehicle:
    try:
        vehicle = db.exec(
            select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id)
        ).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    current_user.active_vehicle_id = vehicle.id
    for record in db.exec(select(Vehicle).where(Vehicle.user_id == current_user.id)).all():
        record.is_active = record.id == vehicle.id
        db.add(record)
    db.add(current_user)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.delete("/{vehicle_id}", response_model=SessionActionResponse)
def delete_vehicle(
    vehicle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SessionActionResponse:
    try:
        vehicle = db.exec(
            select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id)
        ).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    # SessionParticipant.vehicle_id is NOT NULL, so deleting a car that has race
    # history would orphan that FK. Keep history intact by refusing the delete
    # (the car stays in the garage) rather than cascading into past results.
    in_use = db.exec(
        select(SessionParticipant).where(SessionParticipant.vehicle_id == vehicle_id)
    ).first()
    if in_use:
        raise HTTPException(
            status_code=400,
            detail="This vehicle has race history and can't be deleted — it stays in your garage to preserve past results.",
        )
    was_active = current_user.active_vehicle_id == vehicle.id
    db.delete(vehicle)
    if was_active:
        # Promote another vehicle so the user isn't blocked from racing.
        remaining = db.exec(
            select(Vehicle).where(Vehicle.user_id == current_user.id, Vehicle.id != vehicle_id)
        ).all()
        promoted = remaining[0] if remaining else None
        for record in remaining:
            record.is_active = record is promoted
            db.add(record)
        current_user.active_vehicle_id = promoted.id if promoted else None
        db.add(current_user)
    db.commit()
    return SessionActionResponse(success=True, message="Vehicle deleted")
